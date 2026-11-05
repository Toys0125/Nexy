import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../stores', () => ({
    useUserStore: () => ({ currentUser: { id: 'test-user' } }),
    useNotificationStore: () => ({ refreshNotifications: vi.fn() }),
    useGalleryStore: vi.fn(),
    useInstanceStore: vi.fn(),
    useSharedFeedStore: vi.fn(),
    useUiStore: vi.fn()
}));
vi.mock('../../coordinators/userCoordinator', () => ({
    applyUser: vi.fn(),
    applyCurrentUser: vi.fn(),
    getCurrentUser: vi.fn()
}));
vi.mock('../../coordinators/groupCoordinator', () => ({
    onGroupLeft: vi.fn(),
    applyGroup: vi.fn(),
    handleGroupMember: vi.fn()
}));
vi.mock('../../coordinators/friendRelationshipCoordinator', () => ({
    handleFriendAdd: vi.fn(),
    handleFriendDelete: vi.fn()
}));
vi.mock('../../coordinators/friendPresenceCoordinator', () => ({ runUpdateFriendFlow: vi.fn() }));
vi.mock('../../coordinators/locationCoordinator', () => ({ runSetCurrentUserLocationFlow: vi.fn() }));
vi.mock('../../shared/utils', () => ({ debounce: (fn) => fn, parseLocation: vi.fn() }));
vi.mock('../appConfig', () => ({ AppDebug: { debugWebSocket: false } }));
vi.mock('../nexvr/mappers', () => ({
    presenceState: vi.fn(),
    presenceToUser: vi.fn(),
    toNexVRNotification: vi.fn()
}));
vi.mock('../nexvr/realtime', () => ({
    realtime: {
        notifications: [],
        on: vi.fn(() => vi.fn()),
        connect: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn()
    }
}));
vi.mock('../nexvr/gameSession', () => ({ startGameSession: vi.fn(() => vi.fn()) }));
vi.mock('../nexvr/groupInstances', () => ({ startGroupInstances: vi.fn(() => vi.fn()) }));
vi.mock('../../api', () => ({ groupRequest: vi.fn() }));
vi.mock('../request', () => ({
    request: vi.fn(async (endpoint) => (endpoint === 'auth' ? { ok: true, token: 'test-token' } : {}))
}));
vi.mock('../watchState', () => ({ watchState: { isFriendsLoaded: true, isLoggedIn: true } }));
vi.mock('worker-timers', () => ({
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn()
}));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));

import { realtime } from '../nexvr/realtime';
import { closeWebSocket, initWebsocket, wsMessageRate, wsState } from '../websocket';

describe('WebSocket received-frame telemetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
        vi.clearAllMocks();
    });

    afterEach(() => {
        closeWebSocket();
        vi.useRealTimers();
    });

    test('records received frames in the live rate history and lifetime counters', async () => {
        await initWebsocket();
        expect(realtime.connect).toHaveBeenCalledWith('test-token', 'test-user');

        const messageListener = realtime.on.mock.calls.find(([event]) => event === 'message')?.[1];
        expect(messageListener).toBeTypeOf('function');

        messageListener(128);
        messageListener(64);
        vi.setSystemTime(new Date('2026-11-03T12:00:01Z'));
        messageListener(256);

        expect(wsMessageRate.getHistory().slice(-2)).toEqual([2, 1]);
        expect(wsState.messageCount).toBe(3);
        expect(wsState.bytesReceived).toBe(448);
    });
});
