const mocks = vi.hoisted(() => ({ request: vi.fn(), applyInstance: vi.fn((json) => json) }));
vi.mock('../../services/request', () => ({ request: mocks.request }));
vi.mock('../../stores', () => ({ useInstanceStore: () => ({ applyInstance: mocks.applyInstance }) }));

import instanceRequest from '../instance';
import { watchState } from '../../services/watchState';

test('instance API checks the login session immediately before applying a response', async () => {
    watchState.isLoggedIn = true;
    let finish;
    mocks.request.mockReturnValueOnce(
        new Promise((resolve) => {
            finish = resolve;
        })
    );
    const old = instanceRequest.getInstance({ worldId: 'world', instanceId: 'private' });
    const rejected = expect(old).rejects.toThrow('previous login session');
    watchState.isLoggedIn = false;
    watchState.isLoggedIn = true;
    finish({ id: 'previous-account-details' });
    await rejected;
    expect(mocks.applyInstance).not.toHaveBeenCalled();

    mocks.request.mockResolvedValueOnce({ id: 'current-account-details' });
    await expect(instanceRequest.getInstance({ worldId: 'world', instanceId: 'private' })).resolves.toMatchObject({
        ref: { id: 'current-account-details' }
    });
    expect(mocks.applyInstance).toHaveBeenCalledExactlyOnceWith({ id: 'current-account-details' });
});
