import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../../appConfig', () => ({
    AppDebug: { websocketDomain: 'wss://nexvr.test', endpointDomain: 'https://nexvr.test/api' }
}));
vi.mock('../../config', () => ({ default: {} }));
vi.mock('../../database', () => ({ database: {} }));
vi.mock('../../../shared/utils/appActions', () => ({}));
vi.mock('../../../coordinators/cacheCoordinator', () => ({
    checkVRChatCache: () => {},
    getBundleDateSize: () => {},
    deleteVRChatCache: () => {}
}));
// Keep the actual transforms while excluding utility exports that bootstrap
// unrelated application stores.
vi.mock('../../../shared/utils', async () =>
    Object.assign(
        {},
        ...(await Promise.all([
            import('../../../shared/utils/base/string'),
            import('../../../shared/utils/base/format'),
            import('../../../shared/utils/common'),
            import('../../../shared/utils/compare'),
            import('../../../shared/utils/group'),
            import('../../../shared/utils/instance'),
            import('../../../shared/utils/location'),
            import('../../../shared/utils/entityTransforms'),
            import('../../../shared/utils/groupTransforms'),
            import('../../../shared/utils/instanceTransforms'),
            import('../../../shared/utils/cacheUtils'),
            import('../../../shared/utils/platformUtils'),
            import('../../../shared/utils/fileUtils'),
            import('../../../shared/utils/world')
        ]))
    )
);
vi.mock('../../../api', () => ({
    groupRequest: {},
    instanceRequest: {},
    userRequest: {},
    worldRequest: {},
    queryRequest: { fetch: async (_key, { worldId }) => ({ ref: { id: worldId, name: 'Club' } }) }
}));
vi.mock('../../../queries', () => ({ patchGroupFromEvent: () => {} }));
vi.mock('../../../coordinators/searchIndexCoordinator', () => ({
    syncGroupSearchIndex: () => {},
    removeGroupSearchIndex: () => {},
    clearGroupSearchIndex: () => {}
}));
vi.mock('../../../stores/game', () => ({ useGameStore: () => ({}) }));
vi.mock('../../../stores/modal', () => ({ useModalStore: () => ({}) }));
vi.mock('../../../stores/notification', () => ({ useNotificationStore: () => ({}) }));
vi.mock('../../../stores/ui', () => ({ useUiStore: () => ({}) }));
vi.mock('../../../stores/user', () => ({
    useUserStore: () => ({ currentUser: { id: 'me' }, cachedUsers: new Map(), userDialog: { visible: false } })
}));
vi.mock('../../../stores/world', () => ({
    useWorldStore: () => ({ cachedWorlds: new Map(), worldDialog: { visible: false } })
}));
vi.mock('../../../stores/friend', () => ({ useFriendStore: () => ({ friends: new Map() }) }));
vi.mock('../../../stores/location', () => ({
    useLocationStore: () => ({ lastLocation: { playerList: new Map(), friendList: new Map() } })
}));
vi.mock('../../../stores/settings/appearance', () => ({ useAppearanceSettingsStore: () => ({}) }));
vi.mock('../../../stores/photon', () => ({ usePhotonStore: () => ({}) }));
vi.mock('../../../stores/sharedFeed', () => ({ useSharedFeedStore: () => ({}) }));

import { realtime } from '../realtime';
import { startGroupInstances } from '../groupInstances';
import { ClientMessageSchema, DataObjectType, ServerMessageSchema } from '../realtimeSchema';
import { useGroupStore } from '../../../stores/group';
import { useInstanceStore } from '../../../stores/instance';
import { i18n } from '../../../plugins/i18n';
import { handleShimRequest } from '../shim';

class Socket {
    static OPEN = 1;
    readyState = 1;
    frames = [];
    send(bytes) {
        this.frames.push(fromBinary(ClientMessageSchema, bytes));
    }
    close() {
        this.readyState = 3;
        this.onclose?.({ code: 1006, reason: '' });
    }
    receive(payload) {
        const bytes = toBinary(ServerMessageSchema, create(ServerMessageSchema, { payload }));
        this.onmessage({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    }
}

const instance = (id, extra = {}) => ({
    id,
    worldId: '6a335eb4fa3baa6c11dae00d',
    groupId: 'g1',
    type: 6,
    region: 'eu-central',
    playerCount: 3,
    maxPlayers: 10,
    displayName: 'Party',
    ...extra
});
const snapshot = (key, list) =>
    realtime.ws.receive({
        case: 'dataUpdate',
        value: { key, data: { case: 'groupInstances', value: { instances: list } } }
    });
const subscriptions = () =>
    realtime.ws.frames.filter((m) => m.payload.case === 'subscribe').at(-1).payload.value.subscriptions;
const groupKeys = () => subscriptions().find((s) => s.type === DataObjectType.GROUP_INSTANCES)?.keys ?? [];

let pinia, wrapper, stop, groups, instances;
async function connect(userId = 'me') {
    const pending = realtime.connect('token', userId);
    realtime.ws.onopen();
    realtime.ws.receive({ case: 'authResult', value: { success: true } });
    await pending;
}

beforeEach(async () => {
    vi.stubGlobal('WebSocket', Socket);
    realtime.reset();
    await connect();
    pinia = createPinia();
    setActivePinia(pinia);
    wrapper = mount(
        {
            setup() {
                groups = useGroupStore();
                instances = useInstanceStore();
                return () => null;
            }
        },
        { global: { plugins: [pinia, i18n] } }
    );
    groups.currentUserGroups.set('g1', { id: 'g1', name: 'Group One' });
    stop = startGroupInstances();
});

afterEach(() => {
    stop();
    realtime.reset();
    wrapper.unmount();
    disposePinia(pinia);
    vi.unstubAllGlobals();
});

test('protobuf snapshots populate real sidebar and dialog stores and replace removed instances', async () => {
    groups.groupDialog.id = 'g1';
    groups.groupDialog.visible = true;
    await nextTick();
    snapshot('g1', [instance('i1'), instance('i2', { type: 5, contentMode: 2 })]);
    await nextTick();
    expect(groups.groupInstances.map((row) => row.instance.name)).toEqual(['Party', 'Party']);
    expect(groups.groupInstances[0].group.name).toBe('Group One');
    expect(groups.groupInstances[0].instance.$location).toMatchObject({
        groupId: 'g1',
        accessTypeName: 'groupPlus',
        region: 'eu'
    });
    expect(groups.groupInstances[1].instance).toMatchObject({ groupAccessType: 'members', ageGate: true });
    expect(groups.groupDialog.instances).toHaveLength(2);
    expect(groups.groupInstances[0].instance.world.name).toBe('Club');

    snapshot('g1', [instance('i2', { type: 5, playerCount: 10 })]);
    expect(groups.groupInstances).toHaveLength(1);
    expect(groups.groupInstances[0].instance).toMatchObject({ userCount: 10, full: true });
    expect(groups.groupDialog.instances).toHaveLength(1);
    expect(groups.groupDialog.instances[0].ref.userCount).toBe(10);

    snapshot('g1', []);
    expect(groups.groupInstances).toEqual([]);
    expect(groups.groupDialog.instances).toEqual([]);
});

test('membership and dialog subscriptions preserve friends, notifications and moderation', async () => {
    realtime.watchInstances(['i-current']);
    groups.groupDialog.id = 'g2';
    groups.groupDialog.visible = true;
    await nextTick();
    expect(groupKeys()).toEqual(['g1', 'g2']);
    expect(subscriptions()).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ type: DataObjectType.FRIENDS_PRESENCE, keys: ['me'] }),
            expect.objectContaining({ type: DataObjectType.NOTIFICATIONS, keys: ['me'] }),
            expect.objectContaining({ type: DataObjectType.INSTANCE_MODERATION, keys: ['i-current'] })
        ])
    );
    snapshot('g1', [instance('i1')]);
    snapshot('g2', [instance('i2', { groupId: 'g2', type: 7 })]);
    expect(groups.groupInstances).toHaveLength(1);
    expect(groups.groupDialog.instances[0].ref.groupAccessType).toBe('public');
    groups.currentUserGroups.delete('g1');
    await nextTick();
    expect(groupKeys()).toEqual(['g2']);
    expect(groups.groupInstances).toEqual([]);
    expect(realtime.groupInstances.has('g1')).toBe(false);
    snapshot('g1', [instance('late')]);
    expect(realtime.groupInstances.has('g1')).toBe(false);
    groups.groupDialog.visible = false;
    await nextTick();
    expect(groupKeys()).toEqual([]);
});

test('reconnect restores subscriptions and replaces snapshots; account changes discard them', async () => {
    snapshot('g1', [instance('old')]);
    const oldSocket = realtime.ws;
    oldSocket.close();
    expect(groups.groupInstances).toEqual([]);
    stop();
    await connect();
    expect(groupKeys()).toEqual(['g1']);
    snapshot('g1', [instance('new')]);
    stop = startGroupInstances();
    expect(groups.groupInstances[0].instance.name).toBe('Party');
    expect(groups.groupInstances[0].instance.$location.instanceName).toBe('new');
    await connect('other');
    expect(groupKeys()).toEqual([]);
    expect(groups.groupInstances).toEqual([]);
    oldSocket.receive({
        case: 'dataUpdate',
        value: { key: 'g1', data: { case: 'groupInstances', value: { instances: [instance('stale')] } } }
    });
    expect(realtime.getGroupInstances()).toEqual([]);
});

test('shim group routes return the real snapshot cache without REST discovery', async () => {
    snapshot('g1', [instance('i1'), instance('closed', { status: 'closed' }), instance('wrong', { groupId: 'g2' })]);
    const native = vi.fn();
    for (const path of ['users/me/instances/groups', 'users/me/instances/groups/g1']) {
        const result = await handleShimRequest({ url: `https://nexvr.test/api/${path}`, method: 'GET' }, native);
        expect(result.status).toBe(200);
        expect(JSON.parse(result.data).instances).toHaveLength(1);
        expect(JSON.parse(result.data).instances[0]).toMatchObject({
            ownerId: 'g1',
            worldId: '6a335eb4fa3baa6c11dae00d',
            userCount: 3
        });
    }
    expect(native).not.toHaveBeenCalled();
    expect(instances.cachedInstances.size).toBe(1);
});

test('shim group routes reject requests for another user instead of returning the caller snapshot', async () => {
    snapshot('g1', [instance('i1')]);
    const native = vi.fn();
    for (const path of ['users/other/instances/groups', 'users/other/instances/groups/g1']) {
        const result = await handleShimRequest({ url: `https://nexvr.test/api/${path}`, method: 'GET' }, native);
        expect(result.status).toBe(403);
        expect(JSON.parse(result.data)).toEqual({
            error: { message: 'User ID must be your own.', status_code: 403 }
        });
    }
    expect(native).not.toHaveBeenCalled();
    expect(realtime.getGroupInstances()).toHaveLength(1);
});
