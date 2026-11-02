const instanceMocks = vi.hoisted(() => ({ applyInstance: vi.fn((json) => json) }));
vi.mock('../../stores', () => ({
    useAuthStore: () => ({}),
    useModalStore: () => ({}),
    useNotificationStore: () => ({}),
    useUpdateLoopStore: () => ({}),
    useInstanceStore: () => ({ applyInstance: instanceMocks.applyInstance })
}));
vi.mock('../../coordinators/userCoordinator', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../appConfig.js', () => ({
    AppDebug: { endpointDomain: 'https://nexvr.net/api' },
    isApiLogSuppressed: () => true,
    logWebRequest: vi.fn()
}));
vi.mock('../webapi.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { request } from '../request';
import webApiService from '../webapi';
import { watchState } from '../watchState';
import instanceRequest from '../../api/instance';

beforeEach(() => {
    watchState.isLoggedIn = false;
    watchState.isLoggedIn = true;
    vi.clearAllMocks();
});

describe('instance request account isolation', () => {
    test('a new login does not reuse old work and late results never reach the instance cache', async () => {
        let finishOld, finishCurrent;
        webApiService.execute
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
        const old = instanceRequest.getInstance({ worldId: 'world', instanceId: 'restricted' });
        const rejected = expect(old).rejects.toThrow('previous login session');
        watchState.isLoggedIn = false;
        watchState.isLoggedIn = true;
        const current = instanceRequest.getInstance({ worldId: 'world', instanceId: 'restricted' });
        expect(webApiService.execute).toHaveBeenCalledTimes(2);
        finishOld({ status: 200, data: '{"id":"restricted","creatorName":"Previous account only"}' });
        await rejected;
        expect(instanceMocks.applyInstance).not.toHaveBeenCalled();
        // Finishing old work must not discard the new session's pending transport request.
        const sharedCurrent = request('instances/world:restricted');
        expect(webApiService.execute).toHaveBeenCalledTimes(2);
        finishCurrent({ status: 200, data: '{"id":"current-account-result"}' });
        await expect(current).resolves.toMatchObject({ ref: { id: 'current-account-result' } });
        await sharedCurrent;
        expect(instanceMocks.applyInstance).toHaveBeenCalledExactlyOnceWith({ id: 'current-account-result' });
    });

    test('a forbidden response from the previous account does not suppress the next account request', async () => {
        webApiService.execute.mockResolvedValueOnce({ status: 403, data: '{}' });
        await expect(request('instances/world:private')).rejects.toMatchObject({ status: 403 });
        watchState.isLoggedIn = false;
        watchState.isLoggedIn = true;
        webApiService.execute.mockResolvedValueOnce({ status: 200, data: '{"id":"allowed"}' });
        await expect(request('instances/world:private')).resolves.toEqual({ id: 'allowed' });
        expect(webApiService.execute).toHaveBeenCalledTimes(2);
    });
});

describe('request failure handling', () => {
    test('preserves the original exception message and cause', async () => {
        const cause = new TypeError('Profile response is missing its user');
        webApiService.execute.mockRejectedValueOnce(cause);

        const error = await request('profile/broken').catch((err) => err);

        expect(error.message).toContain(cause.message);
        expect(error.cause).toBe(cause);
        expect(error.endpoint).toBe('profile/broken');
    });

    test('a handled failed GET leaves no unhandled cleanup rejection and can be retried', async () => {
        webApiService.execute.mockResolvedValueOnce({
            status: 501,
            data: JSON.stringify({ error: { status_code: 501, message: 'Not available on NexVR' } })
        });
        await expect(request('unsupported')).rejects.toMatchObject({ status: 501 });
        // Let the unhandled-rejection event fire if cleanup created an orphan promise.
        await new Promise((resolve) => setTimeout(resolve, 0));

        webApiService.execute.mockResolvedValueOnce({ status: 200, data: '{"id":"ok"}' });
        await expect(request('unsupported')).resolves.toEqual({ id: 'ok' });
        expect(webApiService.execute).toHaveBeenCalledTimes(2);
    });

    test('concurrent GET callers share the returned promise', async () => {
        let finish;
        webApiService.execute.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const first = request('users/shared');
        const second = request('users/shared');
        expect(second).toBe(first);
        finish({ status: 200, data: '{"id":"shared"}' });
        await expect(first).resolves.toEqual({ id: 'shared' });
        expect(webApiService.execute).toHaveBeenCalledTimes(1);
    });
});
