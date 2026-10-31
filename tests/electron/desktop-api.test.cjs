const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDesktopApi } = require('../../src-electron/desktop-api');
const { createLaunchCommands, parseLaunchCommand } = require('../../src-electron/launch-commands');
const { windowsSigning } = require('../../build-scripts/windows-signing');

function fixture() {
    const calls = [];
    let level = 0;
    const empty = { isEmpty: () => true };
    const image = { isEmpty: () => false };
    const window = {
        isDestroyed: () => false,
        isMinimized: () => true,
        restore: () => calls.push('restore'),
        show: () => calls.push('show'),
        focus: () => calls.push('focus'),
        flashFrame: (value) => calls.push(['flash', value]),
        webContents: {
            setZoomLevel: (value) => {
                level = value;
            },
            getZoomLevel: () => level
        }
    };
    const api = createDesktopApi({
        getWindow: () => window,
        storage: { Set: (...args) => calls.push(args) },
        dialog: {
            showOpenDialog: async (_window, options) => {
                calls.push(options);
                return { canceled: true, filePaths: [] };
            }
        },
        nativeImage: {
            createFromPath: () => empty,
            createFromBuffer: (buffer) => {
                assert.equal(buffer.toString(), 'png');
                return image;
            }
        },
        clipboard: { writeImage: (value) => assert.equal(value, image) },
        decodeImage: async () => Buffer.from('png').toString('base64')
    });
    return { api, calls, window };
}

test('zoom uses Chromium levels, persists changes, and rejects invalid input', () => {
    const { api, calls } = fixture();
    api.SetZoom(0);
    assert.equal(api.GetZoom(), 0);
    api.SetZoom(1.5);
    assert.equal(api.GetZoom(), 1.5);
    assert.deepEqual(calls.at(-1), ['VRCX_ZoomLevel', '1.5']);
    api.SetZoom(-100);
    assert.equal(api.GetZoom(), -9);
    assert.throws(() => api.SetZoom(NaN), /Invalid zoom/);
});

test('focus restores a minimized window and stops taskbar flashing', () => {
    const { api, calls } = fixture();
    api.FocusWindow();
    assert.deepEqual(calls, ['restore', 'show', 'focus', ['flash', false]]);
});

test('file dialogs preserve supplied filters and return an empty string on cancellation', async () => {
    const { api, calls } = fixture();
    assert.equal(await api.OpenFileSelectorDialog('C:\\Photos', 'png', 'Images|*.png;*.jpg|All|*.*'), '');
    assert.deepEqual(calls[0], {
        defaultPath: 'C:\\Photos',
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['png', 'jpg'] },
            { name: 'All', extensions: ['*'] }
        ]
    });
    assert.equal(await api.OpenFolderSelectorDialog('C:\\Photos'), '');
    assert.deepEqual(calls[1], { defaultPath: 'C:\\Photos', properties: ['openDirectory'] });
});

test('clipboard falls back to managed PNG decoding', async () => {
    assert.equal(await fixture().api.CopyImageToClipboard('image.bmp'), true);
    await assert.rejects(fixture().api.CopyImageToClipboard(''), /image path/);
});

test('protocol parser ignores unrelated flags and accepts both legacy and Electron launch arguments', () => {
    assert.equal(parseLaunchCommand('--startup'), null);
    assert.equal(parseLaunchCommand('https://nexy/user/test'), null);
    assert.equal(parseLaunchCommand('/uri=nexy://user/test'), 'user/test');
    assert.equal(parseLaunchCommand(' NEXY://world/test '), 'world/test');
});

test('deep links survive startup and reload, and are delivered exactly once in order', () => {
    const queue = createLaunchCommands();
    const received = [];
    queue.enqueue(['--startup', 'nexy://user/one', '/uri=nexy://group/two']);
    queue.flush((command) => received.push(command));
    assert.deepEqual(received, []);
    queue.setReady(true);
    queue.flush((command) => received.push(command));
    queue.flush((command) => received.push(command));
    assert.deepEqual(received, ['user/one', 'group/two']);
    queue.setReady(false);
    queue.enqueue(['nexy://user/three', '--hot-reload']);
    assert.equal(queue.take(), 'user/three');
    assert.equal(queue.take(), '');
});

test('release signing fails closed when its configuration is incomplete', () => {
    assert.deepEqual(windowsSigning({}), { win: { signExecutable: false } });
    assert.throws(() => windowsSigning({ NEXY_WINDOWS_SIGNING: 'invalid' }), /Unknown/);
    assert.throws(() => windowsSigning({ NEXY_WINDOWS_SIGNING: 'pfx' }), /CSC_LINK/);
    assert.throws(() => windowsSigning({ NEXY_WINDOWS_SIGNING: 'azure' }), /endpoint/);
    assert.equal(windowsSigning({ NEXY_WINDOWS_SIGNING: 'pfx', CSC_LINK: 'certificate.pfx' }).forceCodeSigning, true);
    const signed = windowsSigning({
        NEXY_WINDOWS_SIGNING: 'azure',
        NEXY_AZURE_SIGNING_ENDPOINT: 'https://example.com',
        NEXY_AZURE_SIGNING_ACCOUNT: 'account',
        NEXY_AZURE_SIGNING_PROFILE: 'profile',
        NEXY_SIGNING_PUBLISHER: 'Publisher'
    });
    assert.equal(signed.forceCodeSigning, true);
    assert.equal(signed.win.azureSignOptions.certificateProfileName, 'profile');
});
