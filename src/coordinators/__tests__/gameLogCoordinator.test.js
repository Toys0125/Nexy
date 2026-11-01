const mocks = vi.hoisted(() => ({
    database: { getGamelogDatabase: vi.fn() },
    isGameRunning: vi.fn(),
    userRequest: { getUser: vi.fn(), getPublicProfile: vi.fn() },
    game: { isGameRunning: true },
    user: { cachedUsers: new Map(), cachedProfiles: new Map(), applyUserDialogLocation: vi.fn() },
    friend: { friends: new Map() },
    instance: {
        updateCurrentInstanceWorld: vi.fn(),
        getCurrentInstanceUserList: vi.fn(),
        applyWorldDialogInstances: vi.fn(),
        applyGroupDialogInstances: vi.fn()
    },
    vr: { updateVRLastLocation: vi.fn() }
}));

vi.mock('../../shared/utils', async () => ({
    createJoinLeaveEntry: vi.fn(),
    createLocationEntry: vi.fn(),
    createPortalSpawnEntry: vi.fn(),
    createResourceLoadEntry: vi.fn(),
    findUserByDisplayName: (await import('../../shared/utils/user')).findUserByDisplayName,
    parseLocation: vi.fn(),
    parseInventoryFromUrl: vi.fn(),
    parsePrintFromUrl: vi.fn(),
    replaceBioSymbols: vi.fn(),
    getGroupName: vi.fn()
}));
vi.mock('../../shared/utils/base/ui', () => ({ HueToHex: vi.fn() }));
vi.mock('../../shared/utils/common', () => ({ convertFileUrlToImageUrl: vi.fn() }));
vi.mock('../../services/appConfig', () => ({ AppDebug: {}, logWebRequest: vi.fn() }));
vi.mock('../../services/database', () => ({ database: mocks.database }));
vi.mock('../locationCoordinator', () => ({
    runLastLocationResetFlow: vi.fn(),
    runUpdateCurrentUserLocationFlow: vi.fn()
}));
vi.mock('../../api', () => ({ userRequest: mocks.userRequest }));
vi.mock('../../stores/settings/advanced', () => ({ useAdvancedSettingsStore: () => ({}) }));
vi.mock('../../stores/friend', () => ({ useFriendStore: () => mocks.friend }));
vi.mock('../../stores/gallery', () => ({ useGalleryStore: () => ({}) }));
vi.mock('../../stores/game', () => ({ useGameStore: () => mocks.game }));
vi.mock('../../stores/gameLog', () => ({ useGameLogStore: () => ({}) }));
vi.mock('../../stores/settings/general', () => ({ useGeneralSettingsStore: () => ({}) }));
vi.mock('../../stores/instance', () => ({ useInstanceStore: () => mocks.instance }));
vi.mock('../../stores/modal', () => ({ useModalStore: () => ({}) }));
vi.mock('../../stores/notification', () => ({ useNotificationStore: () => ({}) }));
vi.mock('../../stores/photon', () => ({ usePhotonStore: () => ({}) }));
vi.mock('../../stores/sharedFeed', () => ({ useSharedFeedStore: () => ({}) }));
vi.mock('../../stores/user', () => ({ useUserStore: () => mocks.user }));
vi.mock('../../stores/vr', () => ({ useVrStore: () => mocks.vr }));
vi.mock('../../stores/vrcx', () => ({ useVrcxStore: () => ({}) }));
vi.mock('../../services/config', () => ({ default: {} }));

import { tryLoadPlayerList } from '../gameLogCoordinator';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useLocationStore } from '../../stores/location';

mocks.game = reactive(mocks.game);
let locationStore;

const history = () => [
    { type: 'OnPlayerLeft' },
    { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
    { type: 'OnPlayerJoined', userId: '6a54382813df04bba917772a', displayName: 'NexVR', created_at: '2026-10-31' }
];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.isGameRunning.mockResolvedValue(true);
    vi.stubGlobal('AppApi', { IsGameRunning: mocks.isGameRunning });
    mocks.game.isGameRunning = true;
    setActivePinia(createPinia());
    locationStore = useLocationStore();
    vi.spyOn(locationStore, 'setLastLocation');
    mocks.user.cachedUsers.clear();
    mocks.user.cachedProfiles.clear();
});

afterEach(() => vi.unstubAllGlobals());

test('startup does not restore a VRChat session imported by an older build', async () => {
    mocks.database.getGamelogDatabase.mockResolvedValue([
        { type: 'Location', location: 'wrld_legacy:123', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: 'usr_legacy', displayName: 'Legacy' }
    ]);

    await tryLoadPlayerList();

    expect(locationStore.setLastLocation).not.toHaveBeenCalled();
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
    expect(mocks.userRequest.getPublicProfile).not.toHaveBeenCalled();
});

test('restores NexVR players while excluding legacy VRChat IDs from mixed history', async () => {
    mocks.database.getGamelogDatabase.mockResolvedValue([
        { type: 'OnPlayerLeft' },
        { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: 'usr_legacy', displayName: 'Legacy', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: '6a54382813df04bba917772a', displayName: 'NexVR', created_at: '2026-10-31' }
    ]);

    await tryLoadPlayerList();

    expect([...locationStore.lastLocation.playerList.keys()]).toEqual(['6a54382813df04bba917772a']);
    expect(mocks.userRequest.getUser).toHaveBeenCalledExactlyOnceWith({ userId: '6a54382813df04bba917772a' });
    expect(mocks.userRequest.getPublicProfile).toHaveBeenCalledExactlyOnceWith({ userId: '6a54382813df04bba917772a' });
});

test('excludes a legacy ID resolved from a cached display name', async () => {
    const legacy = { id: 'usr_legacy', displayName: 'Legacy' };
    mocks.user.cachedUsers.set(legacy.id, legacy);
    mocks.database.getGamelogDatabase.mockResolvedValue([
        { type: 'OnPlayerLeft' },
        { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: '', displayName: 'Legacy', created_at: '2026-10-31' }
    ]);

    await tryLoadPlayerList();

    expect(locationStore.lastLocation.playerList.size).toBe(0);
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
    expect(mocks.userRequest.getPublicProfile).not.toHaveBeenCalled();
});

test('does not restore stale state if the game stops during the database read', async () => {
    let finishRead;
    mocks.database.getGamelogDatabase.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishRead = resolve;
            })
    );
    const restoration = tryLoadPlayerList();
    mocks.game.isGameRunning = false;
    const stoppedLocation = reactive({ location: '', playerList: new Map(), friendList: new Map() });
    locationStore.lastLocation = stoppedLocation;
    finishRead([
        { type: 'OnPlayerLeft' },
        { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: '6a54382813df04bba917772a', displayName: 'NexVR', created_at: '2026-10-31' }
    ]);

    await restoration;

    expect(locationStore.setLastLocation).not.toHaveBeenCalled();
    expect(locationStore.lastLocation).toBe(stoppedLocation);
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
    expect(mocks.userRequest.getPublicProfile).not.toHaveBeenCalled();
    expect(mocks.instance.updateCurrentInstanceWorld).not.toHaveBeenCalled();
});

test('checks the native process after the read even when the poll loop still reports running', async () => {
    mocks.database.getGamelogDatabase.mockResolvedValue(history());
    mocks.isGameRunning.mockResolvedValue(false);

    await tryLoadPlayerList();

    expect(mocks.game.isGameRunning).toBe(true);
    expect(mocks.isGameRunning).toHaveBeenCalledOnce();
    expect(locationStore.setLastLocation).not.toHaveBeenCalled();
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
});

test.each(['location', 'player joins', 'player leaves', 'player changes'])(
    'keeps live state when %s changes during the history read',
    async (change) => {
        locationStore.lastLocation.playerList.set('live', { userId: 'live', displayName: 'Live' });
        let finishRead;
        mocks.database.getGamelogDatabase.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishRead = resolve;
                })
        );
        const restoration = tryLoadPlayerList();
        if (change === 'location') {
            locationStore.lastLocation = {
                location: 'live-world:live-instance',
                playerList: new Map(),
                friendList: new Map()
            };
        } else if (change === 'player joins') {
            locationStore.lastLocation.playerList.set('new', { userId: 'new', displayName: 'New' });
        } else if (change === 'player leaves') {
            locationStore.lastLocation.playerList.delete('live');
        } else {
            locationStore.lastLocation.playerList.get('live').displayName = 'Changed';
        }
        const liveLocation = locationStore.lastLocation;
        const livePlayers = [...liveLocation.playerList.entries()];
        finishRead(history());

        await restoration;

        expect(locationStore.setLastLocation).not.toHaveBeenCalled();
        expect(locationStore.lastLocation).toBe(liveLocation);
        expect([...liveLocation.playerList.entries()]).toEqual(livePlayers);
        expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
        expect(mocks.userRequest.getPublicProfile).not.toHaveBeenCalled();
    }
);

test('keeps live updates made while the native process check is pending', async () => {
    mocks.database.getGamelogDatabase.mockResolvedValue(history());
    let finishCheck;
    mocks.isGameRunning.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishCheck = resolve;
            })
    );
    const restoration = tryLoadPlayerList();
    await Promise.resolve();
    expect(mocks.isGameRunning).toHaveBeenCalledOnce();
    locationStore.lastLocation.playerList.set('live', { userId: 'live', displayName: 'Live' });
    finishCheck(true);

    await restoration;

    expect(locationStore.setLastLocation).not.toHaveBeenCalled();
    expect(locationStore.lastLocation.playerList.has('live')).toBe(true);
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
});
