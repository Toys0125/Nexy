const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRendererSecurity } = require('../../src-electron/renderer-security');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'Nexy Renderer Security '));
const documentUrl = pathToFileURL(path.join(directory, 'index.html')).href;
const overlayUrl = pathToFileURL(path.join(directory, 'vr.html')).href;
for (const file of ['index.html', 'vr.html', 'other.html']) fs.writeFileSync(path.join(directory, file), 'fixture');
test.after(() => {
    for (const file of ['index.html', 'vr.html', 'other.html']) fs.unlinkSync(path.join(directory, file));
    fs.rmdirSync(directory);
});

function fixture(url = documentUrl) {
    const handles = new Map();
    const messages = new Map();
    const security = createRendererSecurity({
        handle: (channel, fn) => handles.set(channel, fn),
        on: (channel, fn) => messages.set(channel, fn)
    });
    const contents = new EventEmitter();
    contents.mainFrame = { url };
    contents.setWindowOpenHandler = (handler) => (contents.openWindow = handler);
    security.protectWindow({ webContents: contents }, url);
    return { security, handles, messages, contents, event: { sender: contents, senderFrame: contents.mainFrame } };
}

test('native IPC requires a registered window, its main frame, and its intended document', () => {
    const { security, handles, messages, contents, event } = fixture();
    let calls = 0;
    security.handle('native', (_event, value) => {
        calls++;
        return value;
    });
    security.on('ready', () => calls++);
    assert.equal(handles.get('native')(event, 42), 42);
    contents.mainFrame.url += '#/settings';
    messages.get('ready')(event);
    assert.equal(calls, 2);
    const subframe = { ...event, senderFrame: { url: contents.mainFrame.url } };
    const stranger = { ...event, sender: { mainFrame: contents.mainFrame } };
    const detached = { ...event, senderFrame: null };
    for (const bad of [subframe, stranger, detached]) {
        assert.throws(() => handles.get('native')(bad), /Untrusted IPC sender/);
        messages.get('ready')(bad);
    }
    for (const url of ['https://example.com/', 'file:///C:/Nexy/build/html/other.html', 'data:text/html,untrusted']) {
        contents.mainFrame.url = url;
        assert.throws(() => handles.get('native')(event), /Untrusted IPC sender/);
        messages.get('ready')(event);
    }
    contents.mainFrame.url = documentUrl;
    contents.emit('destroyed');
    assert.throws(() => handles.get('native')(event), /Untrusted IPC sender/);
    assert.equal(calls, 2, 'Rejected requests reached native code');
});

test('window guards block other documents, redirects, subframes, popups and webviews', () => {
    const { contents } = fixture();
    for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
        for (const url of [
            'https://example.com/',
            'file:///C:/Nexy/build/html/vr.html',
            'javascript:alert(1)',
            'invalid'
        ]) {
            let prevented = false;
            contents.emit(name, { url, isMainFrame: true, preventDefault: () => (prevented = true) });
            assert.equal(prevented, true, `${name} allowed ${url}`);
        }
        let prevented = false;
        contents.emit(name, {
            url: contents.mainFrame.url + '#/friends',
            isMainFrame: true,
            preventDefault: () => (prevented = true)
        });
        assert.equal(prevented, false, 'Hash routing was blocked');
    }
    let prevented = false;
    contents.emit('will-frame-navigate', {
        url: contents.mainFrame.url,
        isMainFrame: false,
        preventDefault: () => (prevented = true)
    });
    assert.equal(prevented, true);
    assert.deepEqual(contents.openWindow({ url: 'https://example.com/' }), { action: 'deny' });
    prevented = false;
    contents.emit('will-attach-webview', { preventDefault: () => (prevented = true) });
    assert.equal(prevented, true);
});

test('development and overlay documents have the same exact-document IPC policy', () => {
    for (const url of ['http://localhost:9000/index.html', overlayUrl]) {
        const { security, handles, contents, event } = fixture(url);
        security.handle('native', () => true);
        assert.equal(handles.get('native')(event), true);
        contents.mainFrame.url = url.replace('index.html', 'vr.html').replace('vr.html', 'other.html');
        assert.throws(() => handles.get('native')(event), /Untrusted IPC sender/);
    }
});

test('file aliases match only the intended existing document and preserve query restrictions', () => {
    const alias = path.join(directory, 'alias');
    fs.symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try {
        const aliasUrl = pathToFileURL(path.join(alias, 'index.html')).href;
        const { security, handles, contents, event } = fixture(aliasUrl);
        security.handle('native', () => true);
        contents.mainFrame.url = documentUrl;
        assert.equal(handles.get('native')(event), true);
        contents.mainFrame.url = documentUrl + '#settings';
        assert.equal(handles.get('native')(event), true);
        for (const url of [
            overlayUrl,
            documentUrl + '?changed=1',
            pathToFileURL(path.join(alias, 'missing.html')).href
        ]) {
            contents.mainFrame.url = url;
            assert.throws(() => handles.get('native')(event), /Untrusted IPC sender/);
        }
    } finally {
        fs.unlinkSync(alias);
    }
});
