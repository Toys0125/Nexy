vi.mock('../../stores', () => ({
    useAuthStore: () => ({}),
    useModalStore: () => ({}),
    useNotificationStore: () => ({}),
    useUpdateLoopStore: () => ({})
}));
vi.mock('../../coordinators/userCoordinator', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../appConfig.js', () => ({
    AppDebug: { endpointDomain: 'https://nexvr.net/api' },
    isApiLogSuppressed: () => true,
    logWebRequest: vi.fn()
}));
vi.mock('../watchState', () => ({ watchState: { isLoggedIn: true } }));
vi.mock('../webapi.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { request } from '../request';
import webApiService from '../webapi';

beforeEach(() => {
    vi.clearAllMocks();
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
