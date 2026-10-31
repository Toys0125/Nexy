/** Apply the saved Chromium rendering preference before Electron becomes ready. */
function applyGpuPreferences(app, storage) {
    if (storage.Get('VRCX_DisableGpuAcceleration') !== 'true') return;
    if (app.isReady()) throw new Error('GPU preferences must be applied before Electron is ready');
    app.disableHardwareAcceleration();
}

module.exports = { applyGpuPreferences };
