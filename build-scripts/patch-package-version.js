const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const versionFilePath = path.resolve(rootDir, 'Version');
const packageJsonPath = path.resolve(rootDir, 'package.json');

let version = '';
try {
    console.log(`Reading Version from ${versionFilePath}`);
    version = fs.readFileSync(versionFilePath, 'utf8').trim();
    var index = version.indexOf('T');
    if (index > 0) {
        // Remove time part from version
        version = version.substring(0, index).replaceAll('-', '.');
    }
    if (!version || version === 'Nightly Build') {
        version = new Date().toISOString().split('T')[0].replaceAll('-', '.');
    }
    // package.json needs a plain semver: "v2026.11.01-nightly" → "2026.11.1".
    // The Version file keeps the full string for the app and the file names.
    const date = version.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
    if (date) {
        version = date.slice(1).map(Number).join('.');
    }
} catch (err) {
    console.error('Error reading Version file:', err);
    process.exit(1);
}

let packageJson = {};
try {
    console.log(`Reading package.json from ${packageJsonPath}`);
    const packageData = fs.readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(packageData);
} catch (err) {
    console.error('Error reading package.json:', err);
    process.exit(1);
}

packageJson.version = version;

try {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4), 'utf8');
    console.log(`Updated version in package.json to: ${version}`);
} catch (err) {
    console.error('Error writing to package.json:', err);
    process.exit(1);
}
