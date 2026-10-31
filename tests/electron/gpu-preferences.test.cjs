const test = require('node:test');
const assert = require('node:assert/strict');
const { applyGpuPreferences } = require('../../src-electron/gpu-preferences');

test('saved GPU preference disables Chromium before readiness and leaves default rendering alone', () => {
    for (const value of ['', 'false', undefined, 'true']) {
        let disabled = false;
        applyGpuPreferences(
            { isReady: () => false, disableHardwareAcceleration: () => (disabled = true) },
            { Get: () => value }
        );
        assert.equal(disabled, value === 'true');
    }
    assert.throws(
        () => applyGpuPreferences({ isReady: () => true }, { Get: () => 'true' }),
        /before Electron is ready/
    );
});
