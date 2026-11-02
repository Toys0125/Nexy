vi.mock('../../appConfig', () => ({
    AppDebug: { endpointDomain: 'https://nexvr.test/api', websocketDomain: '', debugWebRequests: false }
}));
vi.mock('../../config', () => ({
    default: { getString: async () => '', setString: async () => {}, remove: async () => {} }
}));

import { AppDebug } from '../../appConfig';
import { watchState } from '../../watchState';
import { endSession, handleShimRequest } from '../shim';
import { setTokens } from '../session';
import { realtime } from '../realtime';

const instance = {
    _id: 'room',
    world: 'world',
    type: 'public',
    creator: 'owner-id',
    contentMode: 'sfw',
    playerCount: 1,
    maxPlayers: 32
};
const response = (data) => ({ status: 200, data: JSON.stringify(data) });

/** Supply an instance immediately and let each test control the owner-profile request. */
function nativeWithOwner(profile) {
    return vi.fn(async ({ url }) => {
        const path = new URL(url).pathname;
        if (path.endsWith('/instances/room')) return response(instance);
        if (path.endsWith('/users/owner-id')) return profile({ url });
        return { status: 404, data: '{"message":"Not found"}' };
    });
}

/** Read through the actual instance route, including owner-name enrichment. */
async function lookup(native) {
    const result = await handleShimRequest(
        { url: `${AppDebug.endpointDomain}/instances/world:room`, method: 'GET' },
        native
    );
    expect(result.status).toBe(200);
    return JSON.parse(result.data);
}

beforeEach(async () => {
    vi.useFakeTimers();
    watchState.isLoggedIn = false;
    watchState.isLoggedIn = true;
    realtime.reset();
    AppDebug.endpointDomain = 'https://nexvr.test/api';
    await setTokens({ accessToken: 'current-account', refreshToken: 'refresh' });
});
afterEach(() => {
    realtime.reset();
    vi.useRealTimers();
});

test('a stalled owner profile cannot indefinitely block instance details', async () => {
    const native = nativeWithOwner(() => new Promise(() => {}));
    const result = lookup(native);
    let finished = false;
    result.then(() => {
        finished = true;
    });
    await vi.advanceTimersByTimeAsync(1999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({
        creatorId: 'owner-id',
        userCount: 1,
        $nexvr: { creatorName: '', contentMode: 'sfw' }
    });
    expect(vi.getTimerCount()).toBe(0);
});

test('a timely owner name is preserved and reused within the same login', async () => {
    const native = nativeWithOwner(() => response({ displayName: 'Owner' }));
    expect((await lookup(native)).$nexvr.creatorName).toBe('Owner');
    expect((await lookup(native)).$nexvr.creatorName).toBe('Owner');
    expect(native.mock.calls.filter(([{ url }]) => url.endsWith('/users/owner-id'))).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
});

test('a timed-out profile can be retried without a late result replacing the recovered name', async () => {
    let finishOld;
    const profile = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishOld = resolve;
                })
        )
        .mockResolvedValueOnce(response({ displayName: 'Recovered Owner' }));
    const native = nativeWithOwner(profile);
    const first = lookup(native);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await first).$nexvr.creatorName).toBe('');
    expect((await lookup(native)).$nexvr.creatorName).toBe('Recovered Owner');
    finishOld(response({ displayName: 'Late Owner' }));
    await vi.advanceTimersByTimeAsync(0);
    expect((await lookup(native)).$nexvr.creatorName).toBe('Recovered Owner');
    expect(profile).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
});

test('friends do not require an extra profile request', async () => {
    realtime.friends.set('owner-id', { displayName: 'Friend Owner' });
    const native = nativeWithOwner(() => {
        throw new Error('A friend should not need a profile request');
    });
    expect((await lookup(native)).$nexvr.creatorName).toBe('Friend Owner');
    expect(native).toHaveBeenCalledTimes(1);
});

test('failed profile enrichment falls back and can be retried', async () => {
    const profile = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network failed'))
        .mockResolvedValueOnce(response({ displayName: 'Recovered Owner' }));
    const native = nativeWithOwner(profile);
    expect((await lookup(native)).$nexvr.creatorName).toBe('');
    expect((await lookup(native)).$nexvr.creatorName).toBe('Recovered Owner');
    expect(profile).toHaveBeenCalledTimes(2);
});

test('a later login neither reuses a pending owner lookup nor accepts its late name', async () => {
    let finishOld;
    const oldNative = nativeWithOwner(
        () =>
            new Promise((resolve) => {
                finishOld = resolve;
            })
    );
    const old = lookup(oldNative);
    await vi.advanceTimersByTimeAsync(0);
    expect(finishOld).toBeTypeOf('function');
    watchState.isLoggedIn = false;
    watchState.isLoggedIn = true;
    const currentNative = nativeWithOwner(() => response({ displayName: 'Current Owner' }));
    expect((await lookup(currentNative)).$nexvr.creatorName).toBe('Current Owner');
    finishOld(response({ displayName: 'Previous Owner' }));
    expect((await old).$nexvr.creatorName).toBe('');
    expect((await lookup(currentNative)).$nexvr.creatorName).toBe('Current Owner');
    expect(currentNative.mock.calls.filter(([{ url }]) => url.endsWith('/users/owner-id'))).toHaveLength(1);
});

test('completed owner names are partitioned by login and API endpoint', async () => {
    const native = nativeWithOwner(
        vi
            .fn()
            .mockResolvedValueOnce(response({ displayName: 'First Login' }))
            .mockResolvedValueOnce(response({ displayName: 'Second Login' }))
            .mockResolvedValueOnce(response({ displayName: 'Other Endpoint' }))
    );
    expect((await lookup(native)).$nexvr.creatorName).toBe('First Login');
    watchState.isLoggedIn = false;
    watchState.isLoggedIn = true;
    expect((await lookup(native)).$nexvr.creatorName).toBe('Second Login');
    AppDebug.endpointDomain = 'https://other.nexvr.test/api';
    expect((await lookup(native)).$nexvr.creatorName).toBe('Other Endpoint');
    expect(native.mock.calls.filter(([{ url }]) => url.endsWith('/users/owner-id'))).toHaveLength(3);
});

test('explicit session reset invalidates pending names even before login-state watchers change', async () => {
    let finishOld;
    const old = lookup(
        nativeWithOwner(
            () =>
                new Promise((resolve) => {
                    finishOld = resolve;
                })
        )
    );
    await vi.advanceTimersByTimeAsync(0);
    await endSession();
    await setTokens({ accessToken: 'new-account', refreshToken: 'refresh' });
    expect((await lookup(nativeWithOwner(() => response({ displayName: 'New Owner' })))).$nexvr.creatorName).toBe(
        'New Owner'
    );
    finishOld(response({ displayName: 'Old Owner' }));
    expect((await old).$nexvr.creatorName).toBe('');
});
