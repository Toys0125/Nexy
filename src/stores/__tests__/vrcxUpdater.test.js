import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
    updatePreference: 'Off',
    configRepository: {
        getString: vi.fn(),
        setString: vi.fn()
    },
    changeLogRemoveLinks: vi.fn((value) => value),
    toast: Object.assign(vi.fn(), {
        error: vi.fn(),
        success: vi.fn(),
        warning: vi.fn()
    })
}));

vi.mock('../../services/config', () => ({
    default: mocks.configRepository
}));

vi.mock('../../shared/utils', () => ({
    changeLogRemoveLinks: (...args) => mocks.changeLogRemoveLinks(...args)
}));

vi.mock('vue-sonner', () => ({
    toast: mocks.toast
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key) => key,
        locale: require('vue').ref('en')
    })
}));

function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

import { useVRCXUpdaterStore } from '../vrcxUpdater';

describe('useVRCXUpdaterStore.setAutoUpdateVRCX', () => {
    beforeEach(async () => {
        mocks.updatePreference = 'Off';
        vi.stubGlobal('IS_WINDOWS', true);
        vi.stubGlobal('IS_LINUX', false);
        mocks.configRepository.getString.mockImplementation((key, defaultValue) => {
            if (key === 'VRCX_autoUpdateVRCX') {
                return Promise.resolve(mocks.updatePreference);
            }
            if (key === 'VRCX_id') {
                return Promise.resolve('test-vrcx-id');
            }
            if (key === 'VRCX_lastVRCXVersion') {
                return Promise.resolve('2026.1.0');
            }
            return Promise.resolve(defaultValue ?? '');
        });
        mocks.configRepository.setString.mockResolvedValue(undefined);

        globalThis.AppApi = {
            GetVersion: vi.fn().mockResolvedValue('2026.1.0'),
            OpenLink: vi.fn().mockResolvedValue(undefined),
            DownloadUpdate: vi.fn(),
            CheckForUpdateExe: vi.fn()
        };
        window.electron.getNoUpdater.mockResolvedValue(false);

        setActivePinia(createPinia());
        useVRCXUpdaterStore();
        await flushPromises();
        vi.clearAllMocks();
    });

    afterEach(() => vi.unstubAllGlobals());

    test('sets autoUpdateVRCX to Off, clears pending flag, and persists config', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Off');

        expect(store.autoUpdateVRCX).toBe('Off');
        expect(store.pendingVRCXUpdate).toBe(false);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Off');
    });

    test('updates autoUpdateVRCX for non-Off values and keeps pending flag', async () => {
        const store = useVRCXUpdaterStore();
        store.pendingVRCXUpdate = true;

        await store.setAutoUpdateVRCX('Notify');

        expect(store.autoUpdateVRCX).toBe('Notify');
        expect(store.pendingVRCXUpdate).toBe(true);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Notify');
    });

    test('checks Nexy GitHub stable releases instead of the VRCX feed', async () => {
        const asset = {
            name: 'Nexy_2026.11.1_Setup_x64.exe',
            state: 'uploaded',
            size: 123,
            browser_download_url:
                'https://github.com/valzzu/Nexy/releases/download/v2026.11.1/Nexy_2026.11.1_Setup_x64.exe'
        };
        globalThis.webApiService = {
            execute: vi.fn().mockResolvedValue({
                status: 200,
                data: JSON.stringify([
                    {
                        name: 'Nexy 2026.11.1',
                        tag_name: 'v2026.11.1',
                        published_at: '2026-11-01T12:00:00Z',
                        prerelease: false,
                        assets: [asset],
                        body: 'Nexy release notes'
                    },
                    {
                        name: 'VRCX 2026.12.1',
                        tag_name: '2026.12.1',
                        published_at: '2026-12-01T12:00:00Z',
                        prerelease: false,
                        assets: [
                            {
                                ...asset,
                                name: 'VRCX_2026.12.1_Setup_x64.exe'
                            }
                        ]
                    }
                ])
            })
        };

        const store = useVRCXUpdaterStore();
        expect(store.noUpdater).toBe(false);
        expect(store.canInstallUpdates).toBe(false);
        await store.setAutoUpdateVRCX('Notify');
        expect(await store.checkForVRCXUpdate()).toBe(true);
        expect(globalThis.webApiService.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://api.github.com/repos/valzzu/Nexy/releases?per_page=100'
            })
        );
        expect(store.latestAppVersion).toBe('Nexy 2026.11.1');
        expect(store.pendingVRCXUpdate).toBe(true);
        expect(mocks.toast).toHaveBeenCalled();
        mocks.toast.mock.calls[0][1].action.onClick();
        expect(AppApi.OpenLink).toHaveBeenCalledWith('https://github.com/valzzu/Nexy/releases/tag/v2026.11.1');
        expect(AppApi.DownloadUpdate).not.toHaveBeenCalled();
    });

    test('handles no published Nexy releases without offering an update', async () => {
        globalThis.webApiService = {
            execute: vi.fn().mockResolvedValue({ status: 200, data: '[]' })
        };
        const store = useVRCXUpdaterStore();
        store.noUpdater = false;
        await store.setAutoUpdateVRCX('Notify');
        expect(await store.checkForVRCXUpdate()).toBe(false);
        expect(store.pendingVRCXUpdate).toBe(false);
        expect(mocks.toast).not.toHaveBeenCalled();
    });

    test('honors an explicit disabled-discovery capability', async () => {
        globalThis.webApiService = { execute: vi.fn() };
        window.electron.getNoUpdater.mockResolvedValue(true);
        setActivePinia(createPinia());
        const store = useVRCXUpdaterStore();
        await flushPromises();
        expect(store.noUpdater).toBe(true);
        expect(await store.checkForVRCXUpdate()).toBe(false);
        expect(globalThis.webApiService.execute).not.toHaveBeenCalled();
    });

    test.each(['Auto Download', 'Auto Install'])(
        'normalizes %s to notifications while installation is unavailable',
        async (action) => {
            const store = useVRCXUpdaterStore();
            await store.setAutoUpdateVRCX(action);
            expect(store.autoUpdateVRCX).toBe('Notify');
            expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Notify');
            expect(AppApi.DownloadUpdate).not.toHaveBeenCalled();
        }
    );

    test('migrates saved automatic downloads to notifications without downloading', async () => {
        mocks.updatePreference = 'Auto Download';
        globalThis.webApiService = { execute: vi.fn().mockResolvedValue({ status: 200, data: '[]' }) };
        setActivePinia(createPinia());
        const store = useVRCXUpdaterStore();
        await flushPromises();
        expect(store.autoUpdateVRCX).toBe('Notify');
        expect(store.noUpdater).toBe(false);
        expect(mocks.configRepository.setString).toHaveBeenCalledWith('VRCX_autoUpdateVRCX', 'Notify');
        expect(globalThis.webApiService.execute).toHaveBeenCalled();
        expect(AppApi.DownloadUpdate).not.toHaveBeenCalled();
    });

    test('opens the selected GitHub release for manual installation', async () => {
        const store = useVRCXUpdaterStore();
        store.VRCXUpdateDialog.release = 'Nexy 2026.11.1';
        store.VRCXUpdateDialog.releases = [{ name: 'Nexy 2026.11.1', tag_name: 'v2026.11.1' }];
        await store.installVRCXUpdate();
        expect(AppApi.OpenLink).toHaveBeenCalledWith('https://github.com/valzzu/Nexy/releases/tag/v2026.11.1');
        expect(AppApi.DownloadUpdate).not.toHaveBeenCalled();
        expect(AppApi.CheckForUpdateExe).not.toHaveBeenCalled();
    });
});
