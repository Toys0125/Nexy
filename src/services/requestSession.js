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

/** Identify the login session without retaining credentials or user data. */
export function getRequestSession() {
    return generation;
}

/**
 * Reject late instance results before they reach an account's cache or dialog.
 *
 * @param {number} expected Login session captured when the request started.
 */
export function assertRequestSession(expected) {
    if (expected !== generation) {
        throw new Error('Instance request belongs to a previous login session.');
    }
}
