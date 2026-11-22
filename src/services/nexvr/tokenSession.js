import { ref } from 'vue';
import { StaleRequestError } from '../requestSession';

const tokenSession = ref(0);

export function getTokenSession() {
    return tokenSession.value;
}

export function advanceTokenSession() {
    tokenSession.value++;
}

/** @param {number} expected */
export function assertTokenSession(expected) {
    if (expected !== getTokenSession()) {
        throw new StaleRequestError('NexVR request belongs to a previous login session.');
    }
}
