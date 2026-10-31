// Run with Electron to exercise the real preload, IPC, managed bridge and offscreen bitmap path.
const { app, BrowserWindow, ipcMain, clipboard, nativeImage, nativeTheme, dialog, shell } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createDesktopApi } = require('../../src-electron/desktop-api');
const { createRendererSecurity } = require('../../src-electron/renderer-security');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'Nexy-Electron-Smoke-'));
app.setPath('userData', profile);
const root = path.resolve(__dirname, '../..');
const rid = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'osx' : 'linux'}-${process.arch}`;
require(path.join(root, 'build/Electron', rid, 'VRCX-Electron.cjs'));
const dotnet = require('node-api-dotnet/net10.0');
const program = new dotnet.VRCX.ProgramElectron();
program.PreInit('Nexy Smoke Test', [`--config=${profile}`]);
const stagedUpdate = path.join(profile, 'update.exe');
fs.writeFileSync(stagedUpdate, 'inert legacy update fixture');
program.Init();
assert.equal(fs.readFileSync(stagedUpdate, 'utf8'), 'inert legacy update fixture');
const managed = new dotnet.VRCX.AppApiElectron();
const vr = new dotnet.VRCX.AppApiVrElectron();
let window;
let offscreen;
const rendererIpc = createRendererSecurity(ipcMain);

app.whenReady()
    .then(async () => {
        window = new BrowserWindow({
            show: false,
            webPreferences: { preload: path.join(root, 'src-electron/preload.js') }
        });
        const values = new Map();
        const api = createDesktopApi({
            app,
            clipboard,
            nativeImage,
            nativeTheme,
            dialog,
            shell,
            getWindow: () => window,
            storage: { Set: (key, value) => values.set(key, value) },
            version: 'Nexy Smoke Test',
            decodeImage: (file) => managed.DecodeClipboardImage(file)
        });
        let nativeCalls = 0;
        rendererIpc.handle('callDotNetMethod', (_event, className, methodName, args) => {
            nativeCalls++;
            assert.equal(className, 'AppApiElectron');
            return api[methodName](...args);
        });
        const documentPath = path.join(profile, 'index.html');
        fs.writeFileSync(documentPath, '<html><body>Smoke test</body></html>');
        rendererIpc.protectWindow(window, pathToFileURL(documentPath).href);
        await window.loadFile(documentPath);
        await window.webContents.executeJavaScript(`(async () => {
        const call = (name, args = []) => window.interopApi.callDotNetMethod('AppApiElectron', name, args);
        await call('SetZoom', [1.5]);
        if (await call('GetZoom') !== 1.5) throw new Error('Zoom IPC failed');
        await call('SetUserAgent');
        if (navigator.userAgent !== 'Nexy Smoke Test') throw new Error('User agent IPC failed');
    })()`);
        assert.equal(values.get('VRCX_ZoomLevel'), '1.5');
        const blockedNavigation = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Navigation guard did not run')), 5000);
            window.webContents.once('will-frame-navigate', (event) => {
                clearTimeout(timer);
                if (!event.defaultPrevented) reject(new Error('Foreign document navigation was allowed'));
                else resolve();
            });
        });
        await window.webContents.executeJavaScript(
            `location.href = ${JSON.stringify(pathToFileURL(path.join(profile, 'foreign.html')).href)}; void 0`
        );
        await blockedNavigation;
        assert.equal(window.webContents.getURL(), pathToFileURL(documentPath).href);
        // Programmatic loads bypass navigation events. IPC must still reject
        // an untrusted document even if it has the privileged preload bridge.
        await window.loadURL('data:text/html,<html><body>Untrusted document</body></html>');
        const callsBeforeRejection = nativeCalls;
        await assert.rejects(
            window.webContents.executeJavaScript("window.interopApi.callDotNetMethod('AppApiElectron', 'GetZoom', [])"),
            /Untrusted IPC sender/
        );
        assert.equal(nativeCalls, callsBeforeRejection);
        managed.ExecuteVrOverlayFunction('configUpdate', '{"test":true}');
        const functions = vr.GetExecuteVrOverlayFunctionQueue();
        assert.equal(functions.length, 1);
        // Electron serializes the managed List<KeyValuePair<...>> as entries.
        assert.deepEqual([...functions[0]], ['configUpdate', '{"test":true}']);
        assert.equal(vr.GetExecuteVrOverlayFunctionQueue().length, 0);
        const png = managed.DecodeClipboardImage(path.join(root, 'images/Nexy.png'));
        assert.equal(nativeImage.createFromBuffer(Buffer.from(png, 'base64')).isEmpty(), false);
        assert.throws(() => vr.SubmitOverlayFrame(Buffer.alloc(4)), /Invalid overlay frame size/);
        assert.throws(
            () => managed.DownloadUpdate('https://example.com/setup.exe', '', 0),
            /Automatic updates are disabled/
        );

        offscreen = new BrowserWindow({
            show: false,
            width: 1024,
            height: 1536,
            useContentSize: true,
            webPreferences: {
                offscreen: true,
                backgroundThrottling: false,
                preload: path.join(root, 'src-electron/preload.js')
            }
        });
        const overlayPath = path.join(profile, 'vr.html');
        fs.writeFileSync(
            overlayPath,
            '<html style="background: red"><body style="height:3000px">Overlay<script>window.clicks=0; window.firstClick=new Promise(resolve=>document.addEventListener("click",()=>resolve(++window.clicks)))</script></body></html>'
        );
        rendererIpc.protectWindow(offscreen, pathToFileURL(overlayPath).href);
        const painted = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Offscreen renderer produced no frame')), 15000);
            offscreen.webContents.once('paint', (_event, _dirty, image) => {
                try {
                    const frame = image.resize({ width: 1024, height: 1536 }).toBitmap();
                    assert.equal(frame.length, 1024 * 1536 * 4);
                    vr.SubmitOverlayFrame(frame);
                    clearTimeout(timer);
                    resolve();
                } catch (error) {
                    clearTimeout(timer);
                    reject(error);
                }
            });
        });
        await offscreen.loadFile(overlayPath);
        const callsBeforeOverlay = nativeCalls;
        assert.equal(
            await offscreen.webContents.executeJavaScript(
                "window.interopApi.callDotNetMethod('AppApiElectron', 'GetZoom', [])"
            ),
            window.webContents.getZoomLevel()
        );
        assert.equal(nativeCalls, callsBeforeOverlay + 1);
        await painted;
        offscreen.webContents.sendInputEvent({ type: 'mouseDown', x: 10, y: 10, button: 'left', clickCount: 1 });
        offscreen.webContents.sendInputEvent({ type: 'mouseUp', x: 10, y: 10, button: 'left', clickCount: 1 });
        assert.equal(
            await offscreen.webContents.executeJavaScript(
                'Promise.race([window.firstClick, new Promise((_, reject)=>setTimeout(()=>reject(new Error("Overlay click was not delivered")), 2000))])'
            ),
            1
        );
        console.log(
            'Electron preload/IPC zoom and user agent, navigation/sender guards, managed overlay queue, image decoder and offscreen frame bridge passed'
        );
    })
    .then(
        () => finish(0),
        (error) => {
            console.error(error);
            finish(1);
        }
    );

function finish(code) {
    offscreen?.destroy();
    window?.destroy();
    program.Exit();
    app.exit(code);
}
