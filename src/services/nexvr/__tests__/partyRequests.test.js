import { readPartyRequests, startPartyRequests } from '../partyRequests';

vi.mock('worker-timers', () => ({
    setInterval: (...args) => setInterval(...args),
    clearInterval: (...args) => clearInterval(...args)
}));

const session = '01'.repeat(16);
const entries = ['PartyInvite', 'PartyJoinRequest', 'CameraOffer'].map((kind, index) => ({
    id: `nexvr.party:${index}`,
    kind,
    sender: 'Sample Player'
}));

function snapshot(now = Date.now()) {
    return {
        version: 1,
        session,
        accountId: 'me',
        updatedAt: now,
        entries: entries.map((entry) => ({ ...entry, createdAt: now }))
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

test('the bridge keeps the three in-game types distinct and scoped to the account', () => {
    const now = Date.now();
    const data = snapshot(now);
    expect(readPartyRequests(data, 'me', now)).toMatchObject([
        { type: 'partyInvite', senderUsername: 'Sample Player', $localParty: true },
        { type: 'partyJoinRequest', senderUsername: 'Sample Player', $localParty: true },
        { type: 'cameraOffer', senderUsername: 'Sample Player', $localParty: true }
    ]);
    expect(readPartyRequests(data, 'another-account', now)).toEqual([]);
    expect(readPartyRequests(data, 'me', now + 8100)).toEqual([]);
});

test('polling adds each request once, removes resolved requests, and drops reads after teardown', async () => {
    vi.useFakeTimers();
    const data = snapshot();
    const read = vi.fn().mockResolvedValue(JSON.stringify(data));
    vi.stubGlobal('AppApi', { GetNexVRPartyRequests: read });
    const add = vi.fn();
    const remove = vi.fn();
    const stop = startPartyRequests('me', add, remove);
    await vi.advanceTimersByTimeAsync(2000);
    expect(add).toHaveBeenCalledTimes(3);

    read.mockResolvedValue(JSON.stringify({ ...data, entries: data.entries.slice(1) }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(remove).toHaveBeenCalledWith(`local:${session}:nexvr.party:0`);
    let resolveRead;
    read.mockImplementation(() => new Promise((resolve) => (resolveRead = resolve)));
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    resolveRead(JSON.stringify(data));
    await vi.advanceTimersByTimeAsync(2000);
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
});
