import { describe, expect, test } from 'vitest';

import { createWebSocketMessageRate } from '../websocketMetrics';

const START = new Date('2026-11-03T12:00:00Z').getTime();

describe('WebSocket message rate', () => {
    test('starts with 60 empty seconds', () => {
        expect(createWebSocketMessageRate().getHistory(START)).toEqual(new Array(60).fill(0));
    });

    test('counts frames in their receipt seconds, including a real burst', () => {
        const rate = createWebSocketMessageRate();
        rate.record(START);
        rate.record(START + 500);
        for (let i = 0; i < 1200; i++) rate.record(START + 1000);

        const history = rate.getHistory(START + 2000);
        expect(history.slice(-3)).toEqual([2, 1200, 0]);
        expect(history.reduce((sum, count) => sum + count, 0)).toBe(1202);
    });

    test('retains traffic across a delayed UI tick without merging it into a burst', () => {
        const rate = createWebSocketMessageRate();
        rate.record(START);
        rate.getHistory(START);
        rate.record(START + 1000);
        rate.record(START + 4000);
        rate.record(START + 4000);

        expect(rate.getHistory(START + 5000).slice(-6)).toEqual([1, 1, 0, 0, 2, 0]);
    });

    test('restoring after five minutes includes only the latest minute of hidden traffic', () => {
        const rate = createWebSocketMessageRate();
        rate.getHistory(START);
        // Incoming frames continue while the UI sampling timer is throttled.
        for (let second = 1; second <= 300; second++) rate.record(START + second * 1000);

        const history = rate.getHistory(START + 300_000);
        expect(history).toEqual(new Array(60).fill(1));
        expect(history.reduce((sum, count) => sum + count, 0)).toBe(60);
    });

    test('expires old traffic after sleep even when neither frames nor UI ticks ran', () => {
        const rate = createWebSocketMessageRate();
        rate.record(START);
        expect(rate.getHistory(START + 59_999)[0]).toBe(1);
        expect(rate.getHistory(START + 60_000)).toEqual(new Array(60).fill(0));
        expect(rate.getHistory(START + 600_000)).toEqual(new Array(60).fill(0));
        rate.record(START + 600_000);
        expect(rate.getHistory(START + 600_000).slice(-2)).toEqual([0, 1]);
    });

    test('discards history when the wall clock moves backward', () => {
        const rate = createWebSocketMessageRate();
        rate.record(START);
        rate.record(START + 10_000);
        expect(rate.getHistory(START + 5000)).toEqual(new Array(60).fill(0));
        rate.record(START + 5000);
        expect(rate.getHistory(START + 5000).at(-1)).toBe(1);
        expect(rate.getHistory(START + 10_000).at(-1)).toBe(0);
    });

    test('a clock correction during receipt starts a fresh history', () => {
        const rate = createWebSocketMessageRate();
        rate.record(START + 10_000);
        rate.record(START);
        expect(rate.getHistory(START).slice(-2)).toEqual([0, 1]);
        expect(rate.getHistory(START + 10_000).at(-1)).toBe(0);
    });
});
