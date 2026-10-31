const fs = require('fs');
const path = require('path');
const { getArchAndPlatform } = require('./utils');

const rootDir = path.join(__dirname, '..');
const versionFilePath = path.join(rootDir, 'Version');
const buildDir = path.join(rootDir, 'build');

let version = '';
try {
    version = fs.readFileSync(versionFilePath, 'utf8').trim();
    // if (!version.includes('T')) {
    //     // Remove dots only from Stable version
    //     version = version.replaceAll('.', '');
    // }
} catch (err) {
    console.error('Error reading Version file:', err);
    process.exit(1);
}

/**
 * Renames the build files for the specified architecture and platform
 *
 * @param {string} arch
 * @param {string} platform
 */
function renameBuild(arch, platform) {
    if (platform === 'linux') {
        const oldAppImage = path.join(buildDir, `Nexy_Version.AppImage`);
        const newAppImage = path.join(buildDir, `Nexy_${version}_${arch}.AppImage`);
        try {
            if (fs.existsSync(oldAppImage)) {
                fs.renameSync(oldAppImage, newAppImage);
                console.log(`Renamed: ${oldAppImage} -> ${newAppImage}`);
            } else {
                console.log(`File not found: ${oldAppImage}`);
            }
        } catch (err) {
            console.error('Error renaming files:', err);
            process.exit(1);
        }
    } else if (platform === 'darwin') {
        const oldDmg = path.join(buildDir, `Nexy_Version.dmg`);
        const newDmg = path.join(buildDir, `Nexy_${version}_${arch}.dmg`);
        try {
            if (fs.existsSync(oldDmg)) {
                fs.renameSync(oldDmg, newDmg);
                console.log(`Renamed: ${oldDmg} -> ${newDmg}`);
            } else {
                console.log(`File not found: ${oldDmg}`);
            }
        } catch (err) {
            console.error('Error renaming files:', err);
            process.exit(1);
        }
    } else if (platform === 'win32') {
        for (const [oldName, newName] of [
            ['Nexy_Version.exe', `Nexy_${version}_Setup_${arch}.exe`],
            ['Nexy_Version.zip', `Nexy_${version}_${arch}.zip`]
        ]) {
            const oldPath = path.join(buildDir, oldName);
            const newPath = path.join(buildDir, newName);
            if (!fs.existsSync(oldPath)) {
                throw new Error(`Expected Electron Windows artifact missing: ${oldPath}`);
            }
            fs.renameSync(oldPath, newPath);
            console.log(`Renamed: ${oldPath} -> ${newPath}`);
        }
    } else {
        console.log('No renaming needed for this platform.');
    }
}

const { arch, platform } = getArchAndPlatform();
renameBuild(arch, platform);
