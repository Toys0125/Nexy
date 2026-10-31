// This adapter is intentionally private to NexVR realtime, not a global
// WebSocket replacement. CefSharp cannot rewrite the browser WS Origin.
export function createRealtimeSocket(url) {
    if (
        typeof CefSharp !== 'undefined' &&
        url === 'wss://nexvr.net/api/realtime' &&
        typeof window.AppApi?.NexvrRealtimeOpen === 'function'
    ) {
        return new CefRealtimeSocket(window.AppApi);
    }
    return new WebSocket(url);
}

export class CefRealtimeSocket {
    readyState = 0;
    binaryType = 'arraybuffer';
    onopen = null;
    onmessage = null;
    onclose = null;
    id = null;
    sends = Promise.resolve();

    constructor(api) {
        this.api = api;
        this.start();
    }

    async start() {
        try {
            this.id = await this.api.NexvrRealtimeOpen();
            if (this.readyState === 3) {
                await this.api.NexvrRealtimeClose(this.id);
                return;
            }
            this.readyState = 1;
            this.onopen?.();
            while (this.readyState === 1) {
                const frame = await this.api.NexvrRealtimeReceive(this.id);
                if (this.readyState !== 1) return;
                if (frame.startsWith('close:')) {
                    const [, code, ...reason] = frame.split(':');
                    this.finish(Number(code), reason.join(':'));
                    return;
                }
                const data = Uint8Array.from(atob(frame), (c) => c.charCodeAt(0)).buffer;
                this.onmessage?.({ data });
            }
        } catch {
            this.finish(1006, 'Realtime transport closed');
        }
    }

    send(data) {
        if (this.readyState !== 1) throw new Error('Socket is not open');
        const bytes = new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const base64 = btoa(binary);
        this.sends = this.sends
            .then(() => {
                if (this.readyState === 1) return this.api.NexvrRealtimeSend(this.id, base64);
            })
            .catch(() => this.finish(1006, 'Realtime send failed'));
    }

    close() {
        this.finish(1000, '');
    }

    finish(code, reason) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        if (this.id) Promise.resolve(this.api.NexvrRealtimeClose(this.id)).catch(() => {});
        this.onclose?.({ code, reason });
    }
}
