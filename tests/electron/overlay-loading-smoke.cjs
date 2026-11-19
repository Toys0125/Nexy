const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadManagedBridge } = require('../../src-electron/managed-bridge');

async function run() {
    if (process.platform !== 'win32') {
        console.log('Skipping Windows D3D assembly loading check');
        return;
    }

    const root = path.resolve(__dirname, '../..');
    if (process.argv[2] === '--probe') {
        const dotnet = loadManagedBridge(path.join(root, 'build/Electron', `win-${process.arch}`));
        dotnet.load(process.argv[3]);
        const result = await dotnet.NexyDiagnostics.OverlayLoadProbe.CreateTexture();
        assert.equal(result, 'Background D3D texture creation and upload passed');
        console.log(result);
        return;
    }

    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'Nexy Overlay Load '));
    try {
        execFileSync(
            'dotnet',
            [
                'build',
                path.join(root, 'tests/OverlayLoadProbe/OverlayLoadProbe.csproj'),
                '--artifacts-path',
                artifacts,
                '--configuration',
                'Release',
                '--nologo',
                '--verbosity',
                'quiet'
            ],
            { stdio: 'inherit', windowsHide: true }
        );
        // Exit the managed host before cleanup so Windows releases its DLL locks.
        execFileSync(
            process.execPath,
            [__filename, '--probe', path.join(artifacts, 'bin/OverlayLoadProbe/release/OverlayLoadProbe.dll')],
            { stdio: 'inherit', windowsHide: true, timeout: 30000 }
        );
    } finally {
        fs.rmSync(artifacts, { recursive: true, force: true, maxRetries: 0 });
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
