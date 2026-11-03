const WS_RATE_WINDOW_SECONDS = 60;

/**
 * Count incoming frames by receipt time, independently of the renderer's timer.
 * Keep one bucket per second so memory stays bounded while the UI is hidden.
 */
export function createWebSocketMessageRate() {
    const buckets = Array.from({ length: WS_RATE_WINDOW_SECONDS }, () => ({ second: -Infinity, count: 0 }));
    let lastSecond = -Infinity;

    /** @param {number} now */
    function getSecond(now) {
        const second = Math.floor(now / 1000);
        if (second < lastSecond) {
            // A wall-clock correction must not revive samples from the future.
            for (const bucket of buckets) {
                bucket.second = -Infinity;
                bucket.count = 0;
            }
        }
        lastSecond = second;
        return second;
    }

    /** @param {number} second */
    function getBucket(second) {
        const slot = ((second % WS_RATE_WINDOW_SECONDS) + WS_RATE_WINDOW_SECONDS) % WS_RATE_WINDOW_SECONDS;
        return buckets[slot];
    }

    return {
        /** @param {number} [now] Receipt time in milliseconds. */
        record(now = Date.now()) {
            const second = getSecond(now);
            const bucket = getBucket(second);
            if (bucket.second !== second) {
                bucket.second = second;
                bucket.count = 0;
            }
            bucket.count++;
        },

        /** @param {number} [now] Sample time in milliseconds. */
        getHistory(now = Date.now()) {
            const second = getSecond(now);
            return Array.from({ length: WS_RATE_WINDOW_SECONDS }, (_, index) => {
                const sampleSecond = second - WS_RATE_WINDOW_SECONDS + 1 + index;
                const bucket = getBucket(sampleSecond);
                return bucket.second === sampleSecond ? bucket.count : 0;
            });
        }
    };
}
