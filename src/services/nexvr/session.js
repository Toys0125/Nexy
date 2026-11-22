import configRepository from '../config';
import { advanceTokenSession, assertTokenSession, getTokenSession } from './tokenSession';

const STORAGE_KEY = 'NexVR_session';

/**
 * @typedef {{ accessToken: string; refreshToken: string }} NexvrTokens
 */

/** @type {NexvrTokens | null} */
let tokens = null;
let loaded = false;
/** @type {{ session: number; promise: Promise<boolean> } | null} */
let refreshing = null;

/**
 * Loads the persisted session once, so a restart keeps the user signed in the
 * way VRChat's cookie jar used to.
 *
 * @returns {Promise<NexvrTokens | null>}
 */
async function load() {
    if (!loaded) {
        const session = getTokenSession();
        loaded = true;
        try {
            const raw = await configRepository.getString(STORAGE_KEY, '');
            if (raw && session === getTokenSession()) {
                tokens = JSON.parse(raw);
            }
        } catch (err) {
            console.error('Failed to load NexVR session:', err);
        }
    }
    return tokens;
}

async function persist() {
    try {
        if (tokens) {
            await configRepository.setString(STORAGE_KEY, JSON.stringify(tokens));
        } else {
            await configRepository.remove(STORAGE_KEY);
        }
    } catch (err) {
        console.error('Failed to save NexVR session:', err);
    }
}

/**
 * @returns {Promise<string>} Access token, or '' when signed out
 */
export async function getAccessToken() {
    await load();
    return tokens?.accessToken ?? '';
}

/**
 * @param {NexvrTokens | null} next
 */
export async function setTokens(next) {
    const saved = updateTokens(next);
    advanceTokenSession();
    await saved;
}

/** @param {NexvrTokens | null} next */
async function updateTokens(next) {
    loaded = true;
    tokens = next?.accessToken ? { accessToken: next.accessToken, refreshToken: next.refreshToken } : null;
    await persist();
}

export async function clearTokens() {
    await setTokens(null);
}

/**
 * @returns {Promise<string>} JSON blob that can be handed back to restoreTokens
 */
export async function exportTokens() {
    await load();
    return tokens ? JSON.stringify(tokens) : '';
}

/**
 * @param {string} blob
 */
export async function restoreTokens(blob) {
    try {
        await setTokens(blob ? JSON.parse(blob) : null);
    } catch {
        // a VRChat cookie jar saved by an older build; it is useless here
        await setTokens(null);
    }
}

/**
 * Exchanges the refresh token for a new pair. Concurrent callers share one
 * request, because NexVR rotates the refresh token on every use.
 *
 * A request that was sent with an access token another caller has since
 * replaced just retries with the current one; refreshing again would rotate
 * the pair under requests already in flight.
 *
 * @param {(refreshToken: string) => Promise<NexvrTokens | null>} exchange
 * @param {string} [staleToken] Access token the rejected request was sent with
 * @param {number} [session] Token session captured before the rejected request
 * @returns {Promise<boolean>} True when a new access token is in place
 */
export async function refreshTokens(exchange, staleToken, session = getTokenSession()) {
    await load();
    assertTokenSession(session);
    if (staleToken !== undefined && tokens?.accessToken && tokens.accessToken !== staleToken) {
        return true;
    }
    if (refreshing?.session !== session) {
        const promise = (async () => {
            const refreshToken = tokens?.refreshToken;
            if (!refreshToken) {
                return false;
            }
            let next = null;
            try {
                next = await exchange(refreshToken);
            } catch (err) {
                // only a rejected refresh token ends the session; a dropped
                // connection or a gateway hiccup leaves it for the next try
                if (!(err?.status >= 400 && err.status < 500) || err.status === 429) {
                    return false;
                }
            }
            assertTokenSession(session);
            if (!next?.accessToken) {
                await updateTokens(null);
                return false;
            }
            await updateTokens(next);
            return true;
        })().finally(() => {
            if (refreshing?.promise === promise) refreshing = null;
        });
        refreshing = { session, promise };
    }
    return refreshing.promise;
}
