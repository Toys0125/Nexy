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

    test('treats a failed check as not installed', async () => {
        globalThis.AppApi = {
            HasNexvrLauncherInstall: vi.fn().mockRejectedValue(new Error('missing method')),
            HasNexvrSteamInstall: vi.fn().mockResolvedValue(true)
        };
        const { isToolNavKeyAvailable, refreshToolAvailability } = useToolAvailability();

        await refreshToolAvailability();

        expect(isToolNavKeyAvailable('tool-nexvr-launcher')).toBe(false);
        expect(isToolNavKeyAvailable('tool-nexvr-steam')).toBe(true);
    });

    test('always shows tools without a check', () => {
        const { isToolAvailable, isToolNavKeyAvailable } = useToolAvailability();

        expect(isToolAvailable(toolDefinitionMap.get('nexvr-photos'))).toBe(true);
        expect(isToolNavKeyAvailable('tool-nexvr-photos')).toBe(true);
    });
});
