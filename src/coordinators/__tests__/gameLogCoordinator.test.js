const mocks = vi.hoisted(() => ({
    database: { getGamelogDatabase: vi.fn() },
    userRequest: { getUser: vi.fn(), getPublicProfile: vi.fn() },
    game: { isGameRunning: true },
    location: { lastLocation: {}, setLastLocation: vi.fn() },
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

vi.mock('../../shared/utils', () => ({
    createJoinLeaveEntry: vi.fn(),
    createLocationEntry: vi.fn(),
    createPortalSpawnEntry: vi.fn(),
    createResourceLoadEntry: vi.fn(),
    findUserByDisplayName: vi.fn(),
    parseLocation: vi.fn(),
    parseInventoryFromUrl: vi.fn(),
    parsePrintFromUrl: vi.fn(),
    replaceBioSymbols: vi.fn(),
    getGroupName: vi.fn()
}));
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
vi.mock('../../stores/location', () => ({ useLocationStore: () => mocks.location }));
vi.mock('../../stores/modal', () => ({ useModalStore: () => ({}) }));
vi.mock('../../stores/notification', () => ({ useNotificationStore: () => ({}) }));
vi.mock('../../stores/photon', () => ({ usePhotonStore: () => ({}) }));
vi.mock('../../stores/sharedFeed', () => ({ useSharedFeedStore: () => ({}) }));
vi.mock('../../stores/user', () => ({ useUserStore: () => mocks.user }));
vi.mock('../../stores/vr', () => ({ useVrStore: () => mocks.vr }));
vi.mock('../../stores/vrcx', () => ({ useVrcxStore: () => ({}) }));
vi.mock('../../services/config', () => ({ default: {} }));

import { tryLoadPlayerList } from '../gameLogCoordinator';
import { findUserByDisplayName } from '../../shared/utils';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.game.isGameRunning = true;
    mocks.user.cachedUsers.clear();
    mocks.user.cachedProfiles.clear();
    mocks.location.setLastLocation.mockImplementation((location) => {
        mocks.location.lastLocation = location;
    });
});

test('startup does not restore a VRChat session imported by an older build', async () => {
    mocks.database.getGamelogDatabase.mockResolvedValue([
        { type: 'Location', location: 'wrld_legacy:123', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: 'usr_legacy', displayName: 'Legacy' }
    ]);

    await tryLoadPlayerList();

    expect(mocks.location.setLastLocation).not.toHaveBeenCalled();
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

    expect([...mocks.location.lastLocation.playerList.keys()]).toEqual(['6a54382813df04bba917772a']);
    expect(mocks.userRequest.getUser).toHaveBeenCalledExactlyOnceWith({ userId: '6a54382813df04bba917772a' });
    expect(mocks.userRequest.getPublicProfile).toHaveBeenCalledExactlyOnceWith({ userId: '6a54382813df04bba917772a' });
});

test('excludes a legacy ID resolved from a cached display name', async () => {
    const legacy = { id: 'usr_legacy', displayName: 'Legacy' };
    mocks.user.cachedUsers.set(legacy.id, legacy);
    findUserByDisplayName.mockReturnValueOnce(legacy);
    mocks.database.getGamelogDatabase.mockResolvedValue([
        { type: 'OnPlayerLeft' },
        { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: '', displayName: 'Legacy', created_at: '2026-10-31' }
    ]);

    await tryLoadPlayerList();

    expect(findUserByDisplayName).toHaveBeenCalled();
    expect(mocks.location.lastLocation.playerList.size).toBe(0);
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
    const stoppedLocation = { location: '', playerList: new Map(), friendList: new Map() };
    mocks.location.lastLocation = stoppedLocation;
    finishRead([
        { type: 'OnPlayerLeft' },
        { type: 'Location', location: '6a335eb4fa3baa6c11dae00d:6a40aa000000000000000001', created_at: '2026-10-31' },
        { type: 'OnPlayerJoined', userId: '6a54382813df04bba917772a', displayName: 'NexVR', created_at: '2026-10-31' }
    ]);

    await restoration;

    expect(mocks.location.setLastLocation).not.toHaveBeenCalled();
    expect(mocks.location.lastLocation).toBe(stoppedLocation);
    expect(mocks.userRequest.getUser).not.toHaveBeenCalled();
    expect(mocks.userRequest.getPublicProfile).not.toHaveBeenCalled();
    expect(mocks.instance.updateCurrentInstanceWorld).not.toHaveBeenCalled();
});
