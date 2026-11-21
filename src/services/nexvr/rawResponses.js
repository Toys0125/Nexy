// The last raw NexVR response for each API path, for the dialogs' JSON tabs.
// Everything else in the app sees Nexy's VRChat-shaped copies; these are what
// the server actually sent, with account email masked and avatar and world package keys omitted.

import { toJson } from '@bufbuild/protobuf';
import { shallowReactive, watch } from 'vue';

import { FriendPresenceSchema } from './realtimeSchema';
import { maskEmail } from './mappers';
import { realtime } from './realtime';
import { watchState } from '../watchState';

const MAX_ENTRIES = 300;
// responses that carry session tokens are never kept
const NEVER_KEPT = /^\/auth\/(login|refresh|2fa|passkey|reauth)/;
const AVATAR_DETAIL = /^\/avatars\/[^/]+$/;

/**
 * Insertion order doubles as least-recently-stored order. Reactive per path, so
 * an open JSON tab can refill when the response it shows arrives.
 *
 * @type {Map<string, any>}
 */
const responses = shallowReactive(new Map());

export function clearAvatarResponses() {
    for (const path of responses.keys()) {
        if (AVATAR_DETAIL.test(path)) responses.delete(path);
    }
}

watch(
    () => watchState.isLoggedIn,
    (loggedIn) => {
        if (!loggedIn) clearAvatarResponses();
    },
    { flush: 'sync' }
);

/**
 * @param {string} path NexVR gateway path, e.g. '/users/123'
 * @param {any} data Parsed response body
 * @param {string} [userId] Authenticated account for an avatar detail request
 */
export function keepRawResponse(path, data, userId) {
    const isAvatar = AVATAR_DETAIL.test(path);
    if (NEVER_KEPT.test(path) || (path.startsWith('/avatars/') && (!isAvatar || Array.isArray(data)))) {
        return;
    }
    if (path === '/auth/me' && data?.primaryEmail) {
        // the JSON tab can be on screen or in a screenshot; never show the address in full
        data = { ...data, primaryEmail: maskEmail(data.primaryEmail) };
    }
    const fileDetails =
        isAvatar && userId && data?.owner === userId && Array.isArray(data.versions)
            ? {
                  owner: userId,
                  currentVersion: data.currentVersion,
                  versions: data.versions
                      .filter((version) => version?.package?.url)
                      .map(({ versionNumber, package: { url, decryptionKey, uploadedAt } }) => ({
                          versionNumber,
                          url,
                          decryptionKey,
                          uploadedAt
                      }))
              }
            : undefined;
    if ((isAvatar || /^\/worlds\/[^/]+$/.test(path)) && Array.isArray(data?.versions)) {
        data = {
            ...data,
            versions: data.versions.map((version) => {
                if (!version?.package || !Object.hasOwn(version.package, 'decryptionKey')) {
                    return version;
                }
                const { decryptionKey: _decryptionKey, ...bundle } = version.package;
                return { ...version, package: bundle };
            })
        };
    }
    responses.delete(path);
    responses.set(path, { data, fileDetails });
    if (responses.size > MAX_ENTRIES) {
        responses.delete(responses.keys().next().value);
    }
}

/**
 * @param {string} path NexVR gateway path
 * @returns {any} The last response for that path, or undefined if none this session
 */
export function getRawResponse(path) {
    return responses.get(path)?.data;
}

/**
 * @param {string} avatarId
 * @param {string} userId Active account in the avatar dialog
 */
export function getAvatarFileDetails(avatarId, userId) {
    const details = responses.get(`/avatars/${encodeURIComponent(avatarId)}`)?.fileDetails;
    return details?.owner === userId && details?.versions.length ? details : undefined;
}

/**
 * A friend's presence as received over the realtime socket, in protobuf's
 * standard JSON form (enum names rather than numbers).
 *
 * @param {string} userId
 * @returns {any} Undefined when the user isn't a friend
 */
export function getRawPresence(userId) {
    const presence = realtime.friends.get(userId);
    return presence ? toJson(FriendPresenceSchema, presence) : undefined;
}

/**
 * The given sections, without the ones that have nothing to show.
 *
 * @param {Record<string, any>} sections
 * @returns {Record<string, any>}
 */
export function presentSections(sections) {
    return Object.fromEntries(Object.entries(sections).filter(([, value]) => value !== undefined));
}
