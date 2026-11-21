import { shallowRef, watch } from 'vue';

/**
 * @typedef {{
 *     versionNumber: string;
 *     platform: 'PC' | 'Quest';
 *     rulesetVersion: number;
 *     level: 'low' | 'moderate' | 'high' | 'severe';
 * }} AvatarImpactRating
 */

/**
 * @param {import('vue').ComputedRef<{ versions?: { versionNumber: string }[] } | null>} avatar
 */
export function useAvatarImpact(avatar) {
    const ratings = shallowRef(/** @type {AvatarImpactRating[] | null} */ (null));

    watch(
        avatar,
        async (response, _, onCleanup) => {
            let active = true;
            onCleanup(() => {
                active = false;
            });
            ratings.value = null;

            const versions = response?.versions?.map((version) => version.versionNumber).filter(Boolean);
            if (!versions?.length) return;

            let found = [];
            try {
                const result = JSON.parse(await AppApi.GetNexVRAvatarImpact(versions));
                if (Array.isArray(result)) found = result;
            } catch {
                // The game cache is optional and loading the avatar does not depend on it.
            }
            if (active) ratings.value = found;
        },
        { immediate: true, flush: 'sync' }
    );

    return ratings;
}
