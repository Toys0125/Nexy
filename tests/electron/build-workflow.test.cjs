const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const workflow = (name) => fs.readFileSync(path.join(__dirname, '../../.github/workflows', name), 'utf8');

test('automatic installer validation is credential-free and always unsigned', () => {
    const source = workflow('windows-electron-installer.yml');
    const config = yaml.load(source);
    assert.ok(config.on.pull_request);
    assert.ok(config.on.push);
    assert.doesNotMatch(source, /secrets\s*[.[]|secrets:\s*inherit|id-token:\s*write/);
    const packageStep = config.jobs['build-installer'].steps.find((step) => step.run === 'npm run build-electron');
    assert.deepEqual(packageStep.env, { NEXY_WINDOWS_SIGNING: 'none' });
});

test('nightly preserves its version override and downloads the Electron Windows artifact', () => {
    const nightly = yaml.load(workflow('nightly.yml'));
    const build = yaml.load(workflow('github_actions.yml'));
    assert.equal(typeof build.on.workflow_call.inputs.version, 'object');
    assert.equal(nightly.jobs.builds.with.version, '${{ needs.prepare.outputs.version }}');
    assert.equal(nightly.jobs.builds.with['require-windows-signing'], true);
    assert.equal(
        build.jobs.set_version.steps.find((step) => step.id === 'version').env.VERSION_OVERRIDE,
        '${{ inputs.version }}'
    );
    const upload = build.jobs.build_windows.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    for (const name of ['nightly.yml', 'release.yml']) {
        const config = yaml.load(workflow(name));
        const downloads = (config.jobs.publish || config.jobs.attach).steps.filter((step) =>
            step.uses?.startsWith('actions/download-artifact@')
        );
        assert.deepEqual(
            downloads.map((step) => step.with.name || step.with.pattern),
            [upload.with.name, 'Electron-AppImage-*', 'Electron-MacDmg-*']
        );
    }
});

test('reusable version selection uses the nightly override or falls back to the Version file', () => {
    const build = yaml.load(workflow('github_actions.yml'));
    const script = build.jobs.set_version.steps.find((step) => step.id === 'version').run;
    const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Nexy-version-'));
    try {
        fs.writeFileSync(path.join(root, 'Version'), '1999.01.01\n');
        for (const version of ['', '2099.01.02']) {
            fs.writeFileSync(path.join(root, 'outputs'), '');
            const result = spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
                cwd: root,
                env: { ...process.env, VERSION_OVERRIDE: version, GITHUB_OUTPUT: 'outputs' },
                encoding: 'utf8',
                windowsHide: true
            });
            assert.ifError(result.error);
            assert.equal(result.status, 0, result.stderr);
            assert.deepEqual(fs.readFileSync(path.join(root, 'outputs'), 'utf8').trim().split(/\r?\n/), [
                `version=${version || '1999.01.01'}`,
                `date=${version || '1999.01.01'}`
            ]);
        }
    } finally {
        for (const file of ['Version', 'outputs']) fs.unlinkSync(path.join(root, file));
        fs.rmdirSync(root);
    }
});

test('release verifiers accept all six assets and reject missing, duplicate, or unexpected packages', () => {
    const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles, 'Git/bin/bash.exe') : 'bash';
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Nexy-release-assets-'));
    const assets = path.join(root, 'release-assets');
    fs.mkdirSync(assets);
    const names = ['Setup_x64.exe', 'x64.zip', 'x64.AppImage', 'arm64.AppImage', 'x64.dmg', 'arm64.dmg'].map(
        (suffix) => `Nexy_2099.01.02_${suffix}`
    );
    try {
        for (const name of names) fs.writeFileSync(path.join(assets, name), 'fixture');
        for (const file of ['nightly.yml', 'release.yml']) {
            const config = yaml.load(workflow(file));
            const steps = (config.jobs.publish || config.jobs.attach).steps;
            const script = steps.find((step) => step.name === 'Verify six release packages').run;
            const run = () => {
                const result = spawnSync(bash, ['--noprofile', '--norc', '-c', script], {
                    cwd: root,
                    encoding: 'utf8',
                    windowsHide: true
                });
                assert.ifError(result.error);
                return result;
            };
            const valid = run();
            assert.equal(valid.status, 0, valid.stderr);
            fs.unlinkSync(path.join(assets, names[3]));
            assert.notEqual(run().status, 0, 'Missing ARM64 AppImage passed');
            fs.writeFileSync(path.join(assets, names[3]), 'fixture');
            const extra = path.join(assets, 'Nexy_2099.01.03_x64.zip');
            fs.writeFileSync(extra, 'duplicate');
            assert.notEqual(run().status, 0, 'Duplicate portable ZIP passed');
            fs.unlinkSync(extra);
            const unexpected = path.join(assets, 'unexpected.txt');
            fs.writeFileSync(unexpected, 'unexpected');
            assert.notEqual(run().status, 0, 'Unexpected seventh file passed');
            fs.unlinkSync(unexpected);
        }
    } finally {
        for (const file of fs.readdirSync(assets)) fs.unlinkSync(path.join(assets, file));
        fs.rmdirSync(assets);
        fs.rmdirSync(root);
    }
});

test('published Windows releases require signing and verification before upload', () => {
    const release = yaml.load(workflow('release.yml'));
    assert.equal(release.jobs.builds.with['require-windows-signing'], true);
    const build = yaml.load(workflow('github_actions.yml'));
    assert.ok(
        !build.on.pull_request && !build.on.push,
        'Credential-bearing build gained an automatic code-validation trigger'
    );
    const steps = build.jobs.build_windows.steps;
    const pack = steps.findIndex((step) => step.run === 'npm run build-electron');
    const verify = steps.findIndex((step) => step.run?.includes('verify-windows-signatures.ps1'));
    const upload = steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
    assert.match(steps[pack].env.NEXY_REQUIRE_WINDOWS_SIGNING, /inputs.require-windows-signing/);
    assert.match(steps[verify].if, /inputs.require-windows-signing/);
    assert.ok(pack < verify && verify < upload);
});
