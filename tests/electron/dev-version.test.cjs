const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getDevVersion } = require('../../src-electron/dev-version');

const repoDir = path.join(__dirname, '../..');

test('dev version is the HEAD commit date and short hash', () => {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();
    const version = getDevVersion(repoDir);
    assert.match(version, /^\d{4}\.\d{2}\.\d{2}-[0-9a-f]{7}$/);
    assert.equal(version.split('-')[1], head.slice(0, 7));
});

test('dev version is null outside a git checkout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexy-dev-version-'));
    try {
        assert.equal(getDevVersion(dir), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
