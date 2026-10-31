const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Desktop methods must run in Electron's main process, rather than the managed bridge. */
function createDesktopApi({
    app,
    clipboard,
    dialog,
    nativeImage,
    nativeTheme,
    shell,
    getWindow,
    storage,
    version,
    showNotification,
    restart,
    setTrayIconNotification,
    getLaunchCommand,
    decodeImage
}) {
    const zoom = (level) => {
        if (!Number.isFinite(level)) throw new TypeError('Invalid zoom level');
        level = Math.max(-9, Math.min(9, level));
        getWindow().webContents.setZoomLevel(level);
        storage.Set('VRCX_ZoomLevel', String(level));
    };
    const focus = () => {
        const window = getWindow();
        if (!window || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        window.flashFrame(false);
    };
    const openDialog = async (options) => {
        const result = await dialog.showOpenDialog(getWindow(), options);
        return result.canceled ? '' : result.filePaths[0] || '';
    };
    return {
        ShowDevTools: () => getWindow().webContents.openDevTools(),
        SetZoom: zoom,
        GetZoom: () => getWindow().webContents.getZoomLevel(),
        SetUserAgent: () => getWindow().webContents.setUserAgent(version),
        DesktopNotification: showNotification,
        RestartApplication: restart,
        CheckForUpdateExe: () => false, // Nexy updates are installed manually.
        FocusWindow: focus,
        FlashWindow: () => getWindow().flashFrame(true),
        ChangeTheme: (value) => {
            nativeTheme.themeSource = value === 0 ? 'light' : 'dark';
        },
        DoFunny: () =>
            getWindow().webContents.executeJavaScript(
                'void document.documentElement.animate([{transform:"rotate(0deg)"},{transform:"rotate(360deg)"}], {duration:1000})'
            ),
        GetClipboard: () => clipboard.readText(),
        SetStartup: (enabled) => {
            if (process.platform === 'win32' || process.platform === 'darwin') {
                app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--startup'] });
            }
        },
        CopyImageToClipboard: async (imagePath) => {
            if (typeof imagePath !== 'string' || !imagePath) throw new TypeError('An image path is required');
            let image = nativeImage.createFromPath(imagePath);
            if (image.isEmpty()) {
                // ImageSharp handles BMP/GIF/WebP and other formats nativeImage may reject.
                const data = await decodeImage(imagePath);
                image = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
            }
            if (image.isEmpty()) throw new Error('Could not read an image from the selected file');
            clipboard.writeImage(image);
            return true;
        },
        SetTrayIconNotification: setTrayIconNotification,
        OpenCalendarFile: async (content) => {
            if (typeof content !== 'string' || !content.startsWith('BEGIN:VCALENDAR'))
                throw new TypeError('Invalid calendar file content');
            const filePath = path.join(os.tmpdir(), `Nexy-calendar-${Date.now()}-${process.pid}.ics`);
            fs.writeFileSync(filePath, content, 'utf8');
            const error = await shell.openPath(filePath);
            if (error) throw new Error(error);
        },
        OpenFolderSelectorDialog: (defaultPath = '') => openDialog({ defaultPath, properties: ['openDirectory'] }),
        OpenFileSelectorDialog: (defaultPath = '', defaultExt = '', defaultFilter = 'All files (*.*)|*.*') => {
            const parts = defaultFilter.split('|');
            const filters = [];
            for (let i = 0; i + 1 < parts.length; i += 2) {
                const extensions = parts[i + 1].split(';').map((pattern) => pattern.trim().replace(/^\*\./, ''));
                filters.push({ name: parts[i], extensions: extensions.map((ext) => (ext === '*.*' ? '*' : ext)) });
            }
            if (!filters.length) filters.push({ name: 'Files', extensions: [defaultExt.replace(/^\./, '') || '*'] });
            return openDialog({ defaultPath, properties: ['openFile'], filters });
        },
        GetLaunchCommand: getLaunchCommand
    };
}

module.exports = { createDesktopApi };
