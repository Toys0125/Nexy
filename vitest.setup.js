/**
 * Vitest global setup file.
 * Loads English locale messages into i18n so that
 * translation calls return expected values in tests.
 *
 * Provides global stubs for the Electron/.NET IPC bridge.
 */

import { i18n } from './src/plugins/i18n';

import en from './src/localization/en.json';

const noopAsync = () => Promise.resolve('');

globalThis.ELECTRON = true;
globalThis.IS_LINUX = false;
globalThis.IS_WINDOWS = false;
globalThis.IS_MACOS = false;
// Legacy renderer conditionals are being migrated from backend flags to OS flags.
globalThis.LINUX = true;
globalThis.WINDOWS = false;
window.electron = {
    desktopNotification: vi.fn(),
    getArch: vi.fn().mockResolvedValue('x64'),
    getNoUpdater: vi.fn().mockResolvedValue(true),
    restartApp: vi.fn(),
    copyImageToClipboard: vi.fn().mockResolvedValue(true),
    focusWindow: vi.fn(),
    flashWindow: vi.fn(),
    setStartup: vi.fn(),
    openCalendarFile: vi.fn().mockResolvedValue(undefined),
    setTrayIconNotification: vi.fn(),
    onSystemThemeChanged: vi.fn(),
    onWindowPositionChanged: vi.fn(),
    onWindowSizeChanged: vi.fn(),
    onWindowStateChange: vi.fn(),
    onBrowserFocus: vi.fn(),
    onBrowserBlur: vi.fn(),
    ipcRenderer: { on: vi.fn() }
};

globalThis.AppApi = new Proxy({}, { get: () => noopAsync });
globalThis.WebApi = new Proxy({}, { get: () => noopAsync });
globalThis.VRCXStorage = new Proxy({}, { get: () => noopAsync });
globalThis.SQLite = new Proxy({}, { get: () => noopAsync });
globalThis.LogWatcher = new Proxy({}, { get: () => noopAsync });
globalThis.Discord = new Proxy({}, { get: () => noopAsync });
globalThis.AssetBundleManager = new Proxy({}, { get: () => noopAsync });

// ResizeObserver polyfill (needed by @dnd-kit/vue at import time)
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Browser API stubs not available in jsdom
globalThis.speechSynthesis = {
    getVoices: () => [],
    cancel: () => {},
    speak: () => {}
};

// matchMedia polyfill (standard jsdom workaround)
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
    }))
});

// localStorage polyfill (jsdom may not provide a full implementation)
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
        get length() {
            return store.size;
        },
        key: (index) => [...store.keys()][index] ?? null
    };
}

// Notification API stub
globalThis.Notification = class {
    static permission = 'denied';
    static requestPermission = vi.fn().mockResolvedValue('denied');
    constructor() {}
    close() {}
};

// Mock worker-timers to use native timers (workers unavailable in jsdom)
vi.mock('worker-timers', () => ({
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
}));

i18n.global.setLocaleMessage('en', en);
