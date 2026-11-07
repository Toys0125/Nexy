import { afterEach, describe, expect, test, vi } from 'vitest';

import { toolDefinitionMap } from '../../shared/constants';
import { useToolAvailability } from '../useToolAvailability';

const defaultAppApi = globalThis.AppApi;

describe('useToolAvailability', () => {
    afterEach(() => {
        globalThis.AppApi = defaultAppApi;
    });

    test('shows checked tools only once their check passes', async () => {
        globalThis.AppApi = {
            HasNexvrLauncherInstall: vi.fn().mockResolvedValue(true),
            HasNexvrSteamInstall: vi.fn().mockResolvedValue(false)
        };
        const { isToolAvailable, isToolNavKeyAvailable, refreshToolAvailability } = useToolAvailability();

        await refreshToolAvailability();

        expect(isToolAvailable(toolDefinitionMap.get('nexvr-launcher'))).toBe(true);
        expect(isToolAvailable(toolDefinitionMap.get('nexvr-steam'))).toBe(false);
        expect(isToolNavKeyAvailable('tool-nexvr-launcher')).toBe(true);
        expect(isToolNavKeyAvailable('tool-nexvr-steam')).toBe(false);
    });

    test('keeps the last known result when a check fails', async () => {
        globalThis.AppApi = {
            HasNexvrLauncherInstall: vi.fn().mockResolvedValue(true),
            HasNexvrSteamInstall: vi.fn().mockResolvedValue(false)
        };
        const { isToolNavKeyAvailable, refreshToolAvailability } = useToolAvailability();
        await refreshToolAvailability();

        globalThis.AppApi = {
            HasNexvrLauncherInstall: vi.fn().mockRejectedValue(new Error('check failed')),
            HasNexvrSteamInstall: vi.fn().mockRejectedValue(new Error('check failed'))
        };
        await refreshToolAvailability();

        expect(isToolNavKeyAvailable('tool-nexvr-launcher')).toBe(true);
        expect(isToolNavKeyAvailable('tool-nexvr-steam')).toBe(false);
    });

    test('keeps the latest refresh when an older one finishes last', async () => {
        let resolveOld;
        globalThis.AppApi = {
            HasNexvrLauncherInstall: vi.fn().mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveOld = resolve;
                })
            ),
            HasNexvrSteamInstall: vi.fn().mockResolvedValue(false)
        };
        const { isToolNavKeyAvailable, refreshToolAvailability } = useToolAvailability();

        const oldRefresh = refreshToolAvailability();
        globalThis.AppApi.HasNexvrLauncherInstall.mockResolvedValue(false);
        await refreshToolAvailability();
        resolveOld(true);
        await oldRefresh;

        expect(isToolNavKeyAvailable('tool-nexvr-launcher')).toBe(false);
    });

    test('always shows tools without a check', () => {
        const { isToolAvailable, isToolNavKeyAvailable } = useToolAvailability();

        expect(isToolAvailable(toolDefinitionMap.get('nexvr-photos'))).toBe(true);
        expect(isToolNavKeyAvailable('tool-nexvr-photos')).toBe(true);
    });
});
