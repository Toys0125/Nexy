const fs = require('node:fs');
const { fileURLToPath, pathToFileURL } = require('node:url');

/** Confine privileged IPC to each registered window's own main document. */
function createRendererSecurity(ipcMain) {
    const documents = new Map();
    const documentUrl = (value) => {
        try {
            let url = new URL(value);
            url.hash = ''; // Vue's hash routes stay in the same trusted document.
            if (url.protocol === 'file:') {
                const search = url.search;
                // Chromium expands Windows 8.3 paths when it loads a document.
                // Use native realpath for both sides; the JS implementation
                // preserves short names. Electron also supports files in ASAR.
                url = pathToFileURL(fs.realpathSync.native(fileURLToPath(url)));
                url.search = search;
            }
            return url.href;
        } catch {
            return undefined;
        }
    };
    const isTrustedSender = (event) => {
        const expected = documents.get(event.sender);
        const frame = event.senderFrame;
        return Boolean(expected && frame && frame === event.sender.mainFrame && documentUrl(frame.url) === expected);
    };
    return {
        /** Install guards before loading a packaged page or explicit development URL. */
        protectWindow(window, url) {
            const contents = window.webContents;
            const expected = documentUrl(url);
            if (!expected) throw new TypeError('A valid renderer document URL is required');
            documents.set(contents, expected);
            const preventNavigation = (event, legacyUrl) => {
                if (event.isMainFrame === false || documentUrl(event.url || legacyUrl) !== expected) {
                    event.preventDefault();
                }
            };
            contents.on('will-navigate', preventNavigation);
            contents.on('will-frame-navigate', preventNavigation);
            contents.on('will-redirect', preventNavigation);
            contents.on('will-attach-webview', (event) => event.preventDefault());
            contents.setWindowOpenHandler(() => ({ action: 'deny' }));
            contents.once('destroyed', () => documents.delete(contents));
        },
        /** Check both WebContents identity and main-frame URL before native dispatch. */
        handle(channel, listener) {
            ipcMain.handle(channel, (event, ...args) => {
                if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender');
                return listener(event, ...args);
            });
        },
        /** Ignore one-way messages from unregistered documents and subframes. */
        on(channel, listener) {
            ipcMain.on(channel, (event, ...args) => {
                if (isTrustedSender(event)) listener(event, ...args);
            });
        }
    };
}

module.exports = { createRendererSecurity };
