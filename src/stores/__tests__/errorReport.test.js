import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../../services/config', () => ({
    default: {
        getBool: vi.fn().mockResolvedValue(true),
        setBool: vi.fn().mockResolvedValue(undefined)
    }
}));

import { useErrorReportStore } from '../errorReport';

describe('useErrorReportStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.stubGlobal('VERSION', '2026.11.05-abc1234');
        vi.stubGlobal('NIGHTLY', true);
    });

    test('shows the first error and counts later ones', () => {
        const store = useErrorReportStore();
        store.reportError(new TypeError('x is undefined'), 'unhandledrejection');
        store.reportError(new Error('second'), 'window.onerror');

        const D = store.errorReportDialog;
        expect(D.visible).toBe(true);
        expect(D.message).toBe('TypeError: x is undefined');
        expect(D.source).toBe('unhandledrejection');
        expect(D.extraCount).toBe(1);
    });

    test('ignores network noise', () => {
        const store = useErrorReportStore();
        store.reportError(new Error('Request failed with status 503'), 'unhandledrejection');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('does not reshow a dismissed error', () => {
        const store = useErrorReportStore();
        const error = new Error('boom');
        store.reportError(error, 'window.onerror');
        store.dismissErrorReport();
        store.reportError(error, 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('stays quiet when the popup is disabled', async () => {
        const store = useErrorReportStore();
        await store.setErrorReportPopup();
        store.reportError(new Error('boom'), 'window.onerror');
        expect(store.errorReportDialog.visible).toBe(false);
    });

    test('scrubs usernames from paths', () => {
        const store = useErrorReportStore();
        const error = new Error('ENOENT: C:\\Users\\Iris\\AppData\\Roaming\\Nexy\\x.json');
        error.stack = `Error: ${error.message}\n    at f (file:///C:/Users/Iris/AppData/Local/Programs/Nexy/html/app.js:1:1)\n    at g (/home/iris/.config/Nexy/app.js:2:2)`;
        store.reportError(error, 'window.onerror');

        const D = store.errorReportDialog;
        expect(D.message).toBe('Error: ENOENT: C:\\Users\\<user>\\AppData\\Roaming\\Nexy\\x.json');
        expect(D.stack).toContain('file:///C:/Users/<user>/AppData/Local/Programs/Nexy/html/app.js');
        expect(D.stack).toContain('/home/<user>/.config/Nexy/app.js');
        expect(store.getErrorReportIssueUrl()).not.toMatch(/iris/i);
    });

    test('builds a prefilled issue url within length limit', () => {
        const store = useErrorReportStore();
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
});
