/** Select a signing provider explicitly so release builds cannot silently become unsigned. */
function windowsSigning(env = process.env) {
    const mode = env.NEXY_WINDOWS_SIGNING || 'none';
    if (mode === 'none') return { win: { signExecutable: false } };
    if (mode === 'pfx') {
        if (!(env.WIN_CSC_LINK || env.CSC_LINK)) throw new Error('PFX signing requires WIN_CSC_LINK or CSC_LINK');
        return { forceCodeSigning: true, win: { signtoolOptions: { signingHashAlgorithms: ['sha256'] } } };
    }
    if (mode !== 'azure') throw new Error(`Unknown NEXY_WINDOWS_SIGNING mode: ${mode}`);
    const fields = {
        endpoint: env.NEXY_AZURE_SIGNING_ENDPOINT,
        codeSigningAccountName: env.NEXY_AZURE_SIGNING_ACCOUNT,
        certificateProfileName: env.NEXY_AZURE_SIGNING_PROFILE,
        publisherName: env.NEXY_SIGNING_PUBLISHER
    };
    for (const [key, value] of Object.entries(fields)) {
        if (!value) throw new Error(`Azure signing requires ${key}`);
    }
    return { forceCodeSigning: true, win: { azureSignOptions: fields } };
}

module.exports = { windowsSigning };
