import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import configRepository from '../../services/config';

vi.mock('../../services/config', () => ({
    default: {
        getBool: vi.fn().mockResolvedValue(true),
        setBool: vi.fn().mockResolvedValue(undefined)
    }
}));

import { useErrorReportStore } from '../errorReport';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

/** Store with its saved setting already loaded */
async function createStore() {
    const store = useErrorReportStore();
    await flushPromises();
    return store;
}

describe('useErrorReportStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('VERSION', '2026.11.05-abc1234');
        vi.stubGlobal('NIGHTLY', true);
    });

    test('shows the first error and counts later ones', async () => {
        const store = await createStore();
        store.reportError(new TypeError('x is undefined'), 'unhandledrejection');
        store.reportError(new Error('second'), 'window.onerror');

        const D = store.errorReportDialog;
        expect(D.visible).toBe(true);
        expect(D.message).toBe('TypeError: x is undefined');
        expect(D.source).toBe('unhandledrejection');
        expect(D.extraCount).toBe(1);
    });

    test('ignores network noise', async () => {
        const store = await createStore();
        store.reportError(new Error('Request failed with status 503'), 'unhandledrejection');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('only ignores status codes as whole numbers', async () => {
        const store = await createStore();
        store.reportError(new RangeError('Invalid array length 1500'), 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(true);
    });

    test('does not reshow a dismissed error', async () => {
        const store = await createStore();
        const error = new Error('boom');
        store.reportError(error, 'window.onerror');
        store.dismissErrorReport();
        store.reportError(error, 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('stays quiet when the popup is disabled', async () => {
        const store = await createStore();
        await store.setErrorReportPopup();
        store.reportError(new Error('boom'), 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('holds startup errors until the saved setting loads', async () => {
        vi.mocked(configRepository.getBool).mockResolvedValueOnce(false);
        const store = useErrorReportStore();
        store.reportError(new Error('during startup'), 'window.onerror');
        await flushPromises();
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('shows startup errors once the setting loads enabled', async () => {
        const store = useErrorReportStore();
        store.reportError(new Error('during startup'), 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(false);
        await flushPromises();
        expect(store.errorReportDialog.visible).toBe(true);
    });

    test('toggle still works when the saved setting fails to load', async () => {
        vi.mocked(configRepository.getBool).mockRejectedValueOnce(new Error('SQLite gone'));
        const store = await createStore();
        expect(store.errorReportPopup).toBe(true);
        await store.setErrorReportPopup();
        expect(store.errorReportPopup).toBe(false);
    });

    test('handles a rejection without a reason', async () => {
        const store = await createStore();
        store.reportError(undefined, 'unhandledrejection');
        expect(store.errorReportDialog.visible).toBe(true);
        expect(store.errorReportDialog.message).toBe('undefined');
    });

    test('scrubs usernames from paths', async () => {
        const store = await createStore();
        const error = new Error('ENOENT: C:\\Users\\Iris\\AppData\\Roaming\\Nexy\\x.json');
        error.stack = `Error: ${error.message}\n    at f (file:///C:/Users/Iris/AppData/Local/Programs/Nexy/html/app.js:1:1)\n    at g (/home/iris/.config/Nexy/app.js:2:2)`;
        store.reportError(error, 'window.onerror');

        const D = store.errorReportDialog;
        expect(D.message).toBe('Error: ENOENT: C:\\Users\\<user>\\AppData\\Roaming\\Nexy\\x.json');
        expect(D.stack).toContain('file:///C:/Users/<user>/AppData/Local/Programs/Nexy/html/app.js');
        expect(D.stack).toContain('/home/<user>/.config/Nexy/app.js');
        expect(store.getErrorReportIssueUrl()).not.toMatch(/iris/i);
    });

    test('scrubs usernames containing spaces', async () => {
        const store = await createStore();
        store.reportError(new Error('ENOENT: C:\\Users\\Alice Bob\\AppData\\x.json'), 'window.onerror');
        expect(store.errorReportDialog.message).toBe('Error: ENOENT: C:\\Users\\<user>\\AppData\\x.json');
        expect(store.getErrorReportIssueUrl()).not.toMatch(/alice|bob/i);
    });

    test('builds a prefilled issue url within length limit', async () => {
        const store = await createStore();
        const error = new Error('boom');
        error.stack = `Error: boom\n${'    at someFunction (app.js:1:1)\n'.repeat(500)}`;
        store.reportError(error, 'window.onerror');

        const url = new URL(store.getErrorReportIssueUrl());
        expect(url.origin + url.pathname).toBe('https://github.com/valzzu/Nexy/issues/new');
        expect(url.searchParams.get('title')).toBe('[Bug] Error: boom');
        expect(url.searchParams.get('labels')).toBe('bug');
        expect(url.searchParams.get('body')).toContain('2026.11.05-abc1234 (Nightly)');
        expect(url.searchParams.get('body')).toContain('    ...');
        expect(url.href.length).toBeLessThanOrEqual(7500);
    });

    test('trims a long message with no stack to fit the url limit', async () => {
        const store = await createStore();
        store.reportError('é'.repeat(8000), 'crash-recovery');

        const url = store.getErrorReportIssueUrl();
        expect(url.length).toBeLessThanOrEqual(7500);
        expect(new URL(url).searchParams.get('body')).toContain('é...');
    });
});
