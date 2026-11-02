import { instanceRequest } from '../api';
import { parseLocation } from '../shared/utils/locationParser';
import { sameInstanceLocation } from '../shared/utils/instanceDetails';
import { useInstanceStore, useUiStore } from '../stores';

const pendingInstances = new Map();

export function getCachedInstance(location) {
    const { cachedInstances } = useInstanceStore();
    return (
        cachedInstances.get(location) ||
        [...cachedInstances.values()].find((instance) => sameInstanceLocation(instance.id, location))
    );
}

export function fetchInstanceDetails(location, force = false) {
    const parsed = parseLocation(location);
    if (!parsed.worldId || !parsed.instanceId || !parsed.isRealInstance) return Promise.resolve(null);
    const key = location.split('~')[0];
    if (pendingInstances.has(key)) return pendingInstances.get(key);
    const cached = getCachedInstance(location);
    if (!force && cached && Date.now() - Date.parse(cached.$fetchedAt) < 60000) {
        return Promise.resolve(cached);
    }
    const pending = instanceRequest
        .getInstance({ worldId: parsed.worldId, instanceId: parsed.instanceId })
        .then(({ ref }) => ref)
        .finally(() => pendingInstances.delete(key));
    pendingInstances.set(key, pending);
    return pending;
}

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
 * @param {object} instance
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
