import { instanceRequest } from '../api';
import { parseLocation } from '../shared/utils/locationParser';
import { findCachedInstance } from '../shared/utils/instanceDetails';
import { useInstanceStore, useUiStore } from '../stores';
import { assertRequestSession, getRequestSession } from '../services/requestSession';

const pendingInstances = new Map();
const failedInstances = new Map();
const failureRetryDelay = 60000;

/** Prefer the newest fetched record over partial snapshots of the same stable instance. */
export function getCachedInstance(location) {
    const { cachedInstances } = useInstanceStore();
    return findCachedInstance(cachedInstances, location);
}

/** Reuse fresh details and briefly retain failures; explicit refresh bypasses both caches. */
export function fetchInstanceDetails(location, force = false) {
    const parsed = parseLocation(location);
    if (!parsed.worldId || !parsed.instanceId || !parsed.isRealInstance) return Promise.resolve(null);
    const session = getRequestSession();
    const key = `${session}:${location.split('~')[0]}`;
    if (pendingInstances.has(key)) return pendingInstances.get(key);
    const failed = failedInstances.get(key);
    if (!force && failed && Date.now() - failed.at < failureRetryDelay) {
        return Promise.reject(failed.error);
    }
    failedInstances.delete(key);
    const cached = getCachedInstance(location);
    if (
        !force &&
        cached &&
        cached.$nexvr?.detailsFetched !== false &&
        Date.now() - Date.parse(cached.$fetchedAt) < 60000
    ) {
        return Promise.resolve(cached);
    }
    const pending = instanceRequest
        .getInstance({ worldId: parsed.worldId, instanceId: parsed.instanceId })
        .then(({ ref }) => {
            assertRequestSession(session);
            failedInstances.delete(key);
            return ref;
        })
        .catch((error) => {
            if (session === getRequestSession()) failedInstances.set(key, { at: Date.now(), error });
            // Bound retention when a large friends list exposes unavailable instances.
            if (failedInstances.size > 200) failedInstances.delete(failedInstances.keys().next().value);
            throw error;
        })
        .finally(() => pendingInstances.delete(key));
    pendingInstances.set(key, pending);
    return pending;
}

/** Open a real instance through the shared dialog and breadcrumb navigation. */
export function showInstanceDialog(location, shortName = '') {
    const parsed = parseLocation(location);
    if (!parsed.worldId || !parsed.instanceId || !parsed.isRealInstance) return;
    const instanceStore = useInstanceStore();
    const cached = getCachedInstance(location);
    useUiStore().openDialog({
        type: 'instance',
        id: location,
        tag: location,
        shortName,
        label: cached?.displayName || `#${parsed.instanceName}`
    });
    instanceStore.setInstanceDialogLocation(location, shortName);
}

/**
 * Refresh the player count for a real instance location.
 *
 * @param {string} instance
 */
function refreshInstancePlayerCount(instance) {
    const L = parseLocation(instance);
    if (L.isRealInstance) {
        instanceRequest.getInstance({
            worldId: L.worldId,
            instanceId: L.instanceId
        });
    }
}

export { refreshInstancePlayerCount };
