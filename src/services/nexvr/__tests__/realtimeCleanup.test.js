vi.mock('../../appConfig', () => ({ AppDebug: { websocketDomain: 'wss://custom.example/realtime' } }));

import { realtime } from '../realtime';

afterEach(() => {
    realtime.reset();
    vi.unstubAllGlobals();
});

test('disconnect settles in-flight authentication immediately', async () => {
    const socket = { close: vi.fn(), readyState: 0 };
    vi.stubGlobal(
        'WebSocket',
        vi.fn(function () {
            return socket;
        })
    );
    const connecting = realtime.connect('token', 'user');
    realtime.disconnect();
    await expect(connecting).resolves.toBe(false);
    expect(socket.close).toHaveBeenCalled();
});

test('logout resolves pending requests and ignores old socket events after reconnect', async () => {
    const oldSocket = { close: vi.fn(), readyState: 0 };
    const newSocket = { close: vi.fn(), readyState: 0 };
    vi.stubGlobal(
        'WebSocket',
        vi
            .fn(function () {
                return oldSocket;
            })
            .mockImplementationOnce(function () {
                return oldSocket;
            })
            .mockImplementationOnce(function () {
                return newSocket;
            })
    );
    realtime.connect('old-token', 'old-user');
    const oldOpen = oldSocket.onopen;
    const oldMessage = oldSocket.onmessage;
    const pending = vi.fn();
    realtime.pending.set(1, pending);
    const connecting = realtime.connect('new-token', 'new-user');
    expect(pending).toHaveBeenCalledExactlyOnceWith(null);
    expect(realtime.pending.size).toBe(0);
    oldOpen();
    oldMessage({ data: new ArrayBuffer(0) });
    expect(realtime.ws).toBe(newSocket);
    expect(realtime.connected).toBe(false);
    realtime.reset();
    await expect(connecting).resolves.toBe(false);
});
