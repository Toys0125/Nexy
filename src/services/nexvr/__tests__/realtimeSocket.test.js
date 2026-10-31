import { CefRealtimeSocket, createRealtimeSocket } from '../realtimeSocket';

const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => {
        resolve = a;
        reject = b;
    });
    return { promise, resolve, reject };
};

afterEach(() => vi.unstubAllGlobals());

function bridge() {
    const read = deferred();
    return {
        NexvrRealtimeOpen: vi.fn().mockResolvedValue('socket-1'),
        NexvrRealtimeReceive: vi.fn(() => read.promise),
        NexvrRealtimeSend: vi.fn().mockResolvedValue(),
        NexvrRealtimeClose: vi.fn().mockResolvedValue(),
        read
    };
}

test('uses the bridge only for Cef and the exact first-party endpoint', () => {
    const api = bridge();
    vi.stubGlobal('AppApi', api);
    vi.stubGlobal('CefSharp', {});
    const browserSocket = vi.fn();
    vi.stubGlobal('WebSocket', browserSocket);
    const socket = createRealtimeSocket('wss://nexvr.net/api/realtime');
    expect(socket).toBeInstanceOf(CefRealtimeSocket);
    socket.close();
    for (const url of [
        'wss://example.com/api/realtime',
        'wss://nexvr.net/api/realtime?test',
        'ws://nexvr.net/api/realtime'
    ]) {
        createRealtimeSocket(url);
        expect(browserSocket).toHaveBeenLastCalledWith(url);
    }
    vi.stubGlobal('CefSharp', undefined);
    createRealtimeSocket('wss://nexvr.net/api/realtime');
    expect(browserSocket).toHaveBeenLastCalledWith('wss://nexvr.net/api/realtime');
});

test('copies binary views and serializes sends, including auth before subscribe', async () => {
    const api = bridge();
    const first = deferred();
    api.NexvrRealtimeSend.mockReturnValueOnce(first.promise);
    const socket = new CefRealtimeSocket(api);
    await flush();
    const bytes = new Uint8Array([9, 0, 255, 9]);
    socket.send(bytes.subarray(1, 3));
    socket.send(new Uint8Array([2]));
    bytes.fill(7);
    await flush();
    expect(api.NexvrRealtimeSend.mock.calls).toEqual([['socket-1', 'AP8=']]);
    first.resolve();
    await flush();
    expect(api.NexvrRealtimeSend.mock.calls[1]).toEqual(['socket-1', 'Ag==']);
    socket.close();
});

test('delivers binary messages in order and forwards server close', async () => {
    const api = bridge();
    api.NexvrRealtimeReceive.mockResolvedValueOnce('AP8=')
        .mockResolvedValueOnce('Ag==')
        .mockResolvedValueOnce('close:1008:denied: token');
    const socket = new CefRealtimeSocket(api);
    const frames = [];
    socket.onmessage = ({ data }) => frames.push([...new Uint8Array(data)]);
    socket.onclose = vi.fn();
    await flush();
    expect(frames).toEqual([[0, 255], [2]]);
    expect(socket.onclose).toHaveBeenCalledExactlyOnceWith({ code: 1008, reason: 'denied: token' });
    expect(api.NexvrRealtimeClose).toHaveBeenCalledWith('socket-1');
});

test('closing during connect disposes the late connection without opening', async () => {
    const api = bridge();
    const open = deferred();
    api.NexvrRealtimeOpen.mockReturnValue(open.promise);
    const socket = new CefRealtimeSocket(api);
    socket.onopen = vi.fn();
    socket.close();
    open.resolve('old');
    await flush();
    expect(socket.onopen).not.toHaveBeenCalled();
    expect(api.NexvrRealtimeClose).toHaveBeenCalledExactlyOnceWith('old');
    expect(api.NexvrRealtimeReceive).not.toHaveBeenCalled();
});

test('logout suppresses late reads and clears queued sends', async () => {
    const api = bridge();
    const socket = new CefRealtimeSocket(api);
    socket.onmessage = vi.fn();
    await flush();
    socket.send(new Uint8Array([1]));
    socket.close();
    api.read.resolve('Ag==');
    await flush();
    expect(socket.onmessage).not.toHaveBeenCalled();
    expect(api.NexvrRealtimeSend).not.toHaveBeenCalled();
});

test('handshake and receive failures close once', async () => {
    for (const stage of ['NexvrRealtimeOpen', 'NexvrRealtimeReceive']) {
        const api = bridge();
        api[stage].mockRejectedValue(new Error('failed'));
        const socket = new CefRealtimeSocket(api);
        socket.onclose = vi.fn();
        await flush();
        socket.close();
        expect(socket.onclose).toHaveBeenCalledExactlyOnceWith({ code: 1006, reason: 'Realtime transport closed' });
    }
});
