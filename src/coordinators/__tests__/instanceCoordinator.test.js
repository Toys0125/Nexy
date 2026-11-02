import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    cachedInstances: new Map(),
    getInstance: vi.fn(),
    openDialog: vi.fn(),
    setInstanceDialogLocation: vi.fn()
}));
vi.mock('../../api', () => ({ instanceRequest: { getInstance: mocks.getInstance } }));
vi.mock('../../stores', () => ({
    useInstanceStore: () => ({
        cachedInstances: mocks.cachedInstances,
        setInstanceDialogLocation: mocks.setInstanceDialogLocation
    }),
    useUiStore: () => ({ openDialog: mocks.openDialog })
}));
import { fetchInstanceDetails, getCachedInstance, showInstanceDialog } from '../instanceCoordinator';
import { watchState } from '../../services/watchState';

describe('instance details coordinator', () => {
    let testTime = Date.now();
    beforeEach(() => {
        watchState.isLoggedIn = false;
        watchState.isLoggedIn = true;
        vi.useFakeTimers({ toFake: ['Date'] });
        testTime += 60001;
        vi.setSystemTime(testTime);
        mocks.cachedInstances.clear();
        vi.clearAllMocks();
    });
    afterEach(() => vi.useRealTimers());
    it('finds cached metadata when presence omits the access tags', () => {
        const instance = { id: 'world:room~friends(owner)~region(ca)' };
        mocks.cachedInstances.set(instance.id, instance);
        expect(getCachedInstance('world:room~region(ca)')).toBe(instance);
        expect(getCachedInstance('world:other~region(ca)')).toBeUndefined();
    });
    it('deduplicates requests for the same instance across location variants', async () => {
        let resolve;
        mocks.getInstance.mockReturnValue(
            new Promise((done) => {
                resolve = done;
            })
        );
        const first = fetchInstanceDetails('world:room~region(ca)');
        const second = fetchInstanceDetails('world:room~friends(owner)~region(ca)');
        expect(mocks.getInstance).toHaveBeenCalledTimes(1);
        resolve({ ref: { id: 'world:room' } });
        expect(await first).toEqual({ id: 'world:room' });
        expect(await second).toEqual({ id: 'world:room' });
    });
    it('reuses fresh metadata but refreshes it on request', async () => {
        const instance = { id: 'world:room', $fetchedAt: new Date().toISOString() };
        mocks.cachedInstances.set(instance.id, instance);
        expect(await fetchInstanceDetails('world:room')).toBe(instance);
        expect(mocks.getInstance).not.toHaveBeenCalled();
        mocks.getInstance.mockResolvedValue({ ref: instance });
        await fetchInstanceDetails('world:room', true);
        expect(mocks.getInstance).toHaveBeenCalledTimes(1);
    });
    it('allows explicitly retrying a failed request immediately', async () => {
        mocks.getInstance
            .mockRejectedValueOnce(new Error('Unavailable'))
            .mockResolvedValueOnce({ ref: { id: 'world:room' } });
        await expect(fetchInstanceDetails('world:room')).rejects.toThrow('Unavailable');
        await expect(fetchInstanceDetails('world:room', true)).resolves.toEqual({ id: 'world:room' });
    });
    it('retains failures across remounts and location variants until the retry delay expires', async () => {
        mocks.getInstance
            .mockRejectedValueOnce(new Error('Unavailable'))
            .mockResolvedValueOnce({ ref: { id: 'world:room' } });
        await expect(fetchInstanceDetails('world:room~region(ca)')).rejects.toThrow('Unavailable');
        await expect(fetchInstanceDetails('world:room~friends(owner)~region(ca)')).rejects.toThrow('Unavailable');
        expect(mocks.getInstance).toHaveBeenCalledTimes(1);
        vi.setSystemTime(Date.now() + 60000);
        await expect(fetchInstanceDetails('world:room')).resolves.toEqual({ id: 'world:room' });
        expect(mocks.getInstance).toHaveBeenCalledTimes(2);
    });
    it('fetches complete details even when a realtime snapshot was just cached', async () => {
        mocks.cachedInstances.set('world:room', {
            id: 'world:room',
            $fetchedAt: new Date().toISOString(),
            $nexvr: { detailsFetched: false }
        });
        mocks.getInstance.mockResolvedValue({ ref: { id: 'world:room', creatorId: 'owner' } });
        expect(await fetchInstanceDetails('world:room')).toMatchObject({ creatorId: 'owner' });
        expect(mocks.getInstance).toHaveBeenCalledTimes(1);
    });

    it('keeps pending results and forced refreshes isolated across login sessions', async () => {
        let finishOld, finishCurrent;
        mocks.getInstance
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishOld = resolve;
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishCurrent = resolve;
                    })
            );
        const old = fetchInstanceDetails('world:room');
        const rejected = expect(old).rejects.toThrow('previous login session');
        watchState.isLoggedIn = false;
        watchState.isLoggedIn = true;
        const current = fetchInstanceDetails('world:room', true);
        expect(mocks.getInstance).toHaveBeenCalledTimes(2);
        finishOld({ ref: { id: 'old-account' } });
        await rejected;
        expect(fetchInstanceDetails('world:room')).toBe(current);
        finishCurrent({ ref: { id: 'current-account' } });
        await expect(current).resolves.toEqual({ id: 'current-account' });
    });

    it('does not carry a failed request into the next login session', async () => {
        mocks.getInstance
            .mockRejectedValueOnce(new Error('Forbidden'))
            .mockResolvedValueOnce({ ref: { id: 'allowed' } });
        await expect(fetchInstanceDetails('world:room')).rejects.toThrow('Forbidden');
        watchState.isLoggedIn = false;
        watchState.isLoggedIn = true;
        await expect(fetchInstanceDetails('world:room')).resolves.toEqual({ id: 'allowed' });
        expect(mocks.getInstance).toHaveBeenCalledTimes(2);
    });
    it.each(['offline', 'private', 'traveling', 'local:room', 'world'])(
        'does not fetch or open a non-instance location: %s',
        async (location) => {
            expect(await fetchInstanceDetails(location)).toBeNull();
            showInstanceDialog(location);
            expect(mocks.getInstance).not.toHaveBeenCalled();
            expect(mocks.openDialog).not.toHaveBeenCalled();
        }
    );
    it('opens through the main dialog navigation with the short name', () => {
        showInstanceDialog('world:room~region(ca)', 'short');
        expect(mocks.openDialog).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'instance', id: 'world:room~region(ca)', shortName: 'short' })
        );
        expect(mocks.setInstanceDialogLocation).toHaveBeenCalledWith('world:room~region(ca)', 'short');
    });
});
