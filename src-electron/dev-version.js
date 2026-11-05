const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Version for unpackaged dev runs, from the checked-out commit instead of the
 * committed Version file (which CI only stamps at build time).
 * Formatted "YYYY.MM.DD-<hash7>", the hash suffix marks it as a nightly.
 *
 * @param {string} repoDir
 * @returns {string | null} null when git or the repo isn't available
 */
function getDevVersion(repoDir) {
    // Only the repo root itself, never a parent repo git would walk up to
    if (!fs.existsSync(path.join(repoDir, '.git'))) return null;

    const result = spawnSync('git', ['log', '-1', '--format=%cd %H', '--date=format:%Y.%m.%d'], {
        cwd: repoDir,
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.status !== 0 || !result.stdout) return null;

    const [date, hash] = result.stdout.trim().split(' ');
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date) || !/^[0-9a-f]{40}$/.test(hash)) return null;
    return `${date}-${hash.slice(0, 7)}`;
}

module.exports = { getDevVersion };
