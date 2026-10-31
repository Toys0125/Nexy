function parseLaunchCommand(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(?:\/uri=)?nexy:\/\/(.+)$/i);
    return match ? match[1] : null;
}

/** Keep commands received before renderer startup/sign-in until they can be consumed. */
function createLaunchCommands() {
    const pending = [];
    let ready = false;
    return {
        enqueue(argv) {
            for (const arg of argv) {
                const command = parseLaunchCommand(arg);
                if (command) pending.push(command);
            }
        },
        take() {
            return pending.shift() || '';
        },
        setReady(value) {
            ready = value;
        },
        flush(send) {
            if (!ready) return;
            while (pending.length) send(pending.shift());
        }
    };
}

module.exports = { parseLaunchCommand, createLaunchCommands };
