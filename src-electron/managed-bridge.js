const path = require('node:path');

function loadManagedBridge(directory) {
    const dotnet = require('node-api-dotnet/net10.0');
    require(path.join(directory, 'VRCX-Electron.cjs'));

    if (process.platform === 'win32') {
        // NodeApi's assembly resolver needs a JS scope. Resolve the compositor's
        // managed dependencies here before its background thread creates textures.
        // Load shared dependencies before the DXGI and D3D11 assemblies that use them.
        for (const assembly of [
            'Vortice.Mathematics',
            'SharpGen.Runtime',
            'Vortice.DirectX',
            'Vortice.DXGI',
            'Vortice.Direct3D11'
        ]) {
            const assemblyPath = path.join(directory, `${assembly}.dll`);
            try {
                dotnet.load(assemblyPath);
            } catch (cause) {
                throw new Error(`Failed to preload overlay dependency ${assembly} from ${assemblyPath}`, { cause });
            }
        }
    }

    return dotnet;
}

module.exports = { loadManagedBridge };
