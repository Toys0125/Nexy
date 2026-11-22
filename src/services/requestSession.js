import { watch } from 'vue';
import { watchState } from './watchState';

let generation = 0;

// Synchronous invalidation also catches logout/login pairs within one event-loop turn.
watch(
    () => watchState.isLoggedIn,
    () => {
        generation += 1;
    },
    { flush: 'sync' }
);

/** Expected rejection for work a logout or newer refresh made stale. */
export class StaleRequestError extends Error {
    name = 'StaleRequestError';
}

/** Identify the login session without retaining credentials or user data. */
export function getRequestSession() {
    return generation;
}

/**
 * Reject work that belongs to a previous login session.
 *
 * @param {number} expected Login session captured when the request started.
 */
export function assertRequestSession(expected) {
    if (expected !== generation) {
        throw new StaleRequestError('Request belongs to a previous login session.');
    }
}
