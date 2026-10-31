const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
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
