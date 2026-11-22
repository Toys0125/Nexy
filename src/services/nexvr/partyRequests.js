import * as workerTimers from 'worker-timers';

const PARTY_TYPES = new Map([
    ['PartyInvite', ['partyInvite', 'Invited you to a party. Respond in NexVR.']],
    ['PartyJoinRequest', ['partyJoinRequest', 'Asked to join your party. Respond in NexVR.']],
    ['CameraOffer', ['cameraOffer', 'Sent you a camera offer. Respond in NexVR.']]
]);
const MAX_SNAPSHOT_AGE_MS = 8000;

/**
 * Convert a snapshot exported by the optional NexVR CoreCLR bridge.
 *
 * @param {any} snapshot
 * @param {string} accountId
 * @param {number} [now]
 */
export function readPartyRequests(snapshot, accountId, now = Date.now()) {
    if (
        !accountId ||
        snapshot?.version !== 1 ||
        snapshot.accountId !== accountId ||
        typeof snapshot.session !== 'string' ||
        !/^[a-f0-9]{32}$/.test(snapshot.session) ||
        !Number.isFinite(snapshot.updatedAt) ||
        snapshot.updatedAt < now - MAX_SNAPSHOT_AGE_MS ||
        snapshot.updatedAt > now + 2000 ||
        !Array.isArray(snapshot.entries)
    ) {
        return [];
    }
    const rows = [];
    for (const item of snapshot.entries.slice(0, 25)) {
        const definition = PARTY_TYPES.get(item?.kind);
        if (
            !definition ||
            typeof item.id !== 'string' ||
            !/^nexvr\.party:-?\d{1,10}$/.test(item.id) ||
            !Number.isFinite(item.createdAt) ||
            item.createdAt <= 0 ||
            item.createdAt > now + 2000
        ) {
            continue;
        }
        const [type, message] = definition;
        rows.push({
            id: `local:${snapshot.session}:${item.id}`,
            type,
            message,
            senderUserId: '',
            senderUsername: typeof item.sender === 'string' ? item.sender.slice(0, 120) : '',
            receiverUserId: accountId,
            created_at: new Date(item.createdAt).toISOString(),
            $localParty: true
        });
    }
    return rows;
}

/**
 * @param {string} accountId
 * @param {(row: ReturnType<typeof readPartyRequests>[number]) => void} add
 * @param {(id: string) => void} remove
 */
export function startPartyRequests(accountId, add, remove) {
    if (!window.AppApi?.GetNexVRPartyRequests) return () => {};
    let active = true;
    let polling = false;
    let known = new Set();
    async function poll() {
        if (!active || polling) return;
        polling = true;
        try {
            let snapshot;
            try {
                const json = await AppApi.GetNexVRPartyRequests();
                if (json) snapshot = JSON.parse(json);
            } catch {
                // A missing bridge or invalid snapshot is equivalent to no live requests.
            }
            if (!active) return;
            const rows = readPartyRequests(snapshot, accountId);
            const next = new Set(rows.map((row) => row.id));
            for (const id of known) {
                if (!next.has(id)) remove(id);
            }
            for (const row of rows) {
                if (!known.has(row.id)) add(row);
            }
            known = next;
        } finally {
            polling = false;
        }
    }
    const timer = workerTimers.setInterval(poll, 2000);
    poll();
    return () => {
        active = false;
        workerTimers.clearInterval(timer);
        for (const id of known) remove(id);
    };
}
