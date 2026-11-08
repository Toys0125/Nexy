import { computed } from 'vue';
import { commaNumber, formatDateFilter } from '../../../shared/utils';
import { database } from '../../../services/database';

const PLATFORM_LABELS = {
    standalonewindows: 'PC',
    android: 'Android',
    ios: 'iOS',
    standalonelinux: 'Linux',
    standaloneosx: 'macOS'
};

/**
 * Composable for WorldDialogInfoTab computed properties and actions.
 *
 * @param {import('vue').Ref} worldDialog - Reactive ref to the world dialog state
 * @param {object} deps - External dependencies
 * @param {Function} deps.t - I18n translation function
 * @param {object} deps.toast - Toast notification functions
 * @param {Function} deps.toast.success - Toast success notification function
 * @param {Function} deps.toast.error - Toast error notification function
 * @returns {object} Info composable API
 */
export function useWorldDialogInfo(worldDialog, { t, toast }) {
    const { memo, onWorldMemoChange } = useWorldMemo(worldDialog);

    const favoriteRate = computed(() => {
        return (
            Math.round(
                (((worldDialog.value.ref?.favorites - worldDialog.value.ref?.visits) / worldDialog.value.ref?.visits) *
                    100 +
                    100) *
                    100
            ) / 100
        );
    });

    const worldTags = computed(() => {
        return worldDialog.value.ref?.tags
            ?.filter((tag) => tag.startsWith('author_tag_'))
            .map((tag) => tag.slice('author_tag_'.length))
            .join(', ');
    });

    const worldDialogPlatform = computed(() => {
        const platforms = [];
        for (const pkg of worldDialog.value.ref?.unityPackages || []) {
            if (pkg.variant && pkg.variant !== 'standard' && pkg.variant !== 'security') {
                continue;
            }
            if (!pkg.platform) {
                continue;
            }
            const label = PLATFORM_LABELS[pkg.platform] || pkg.platform;
            // NexVR reports platforms without a VRChat SDK or Unity version.
            const display = pkg.unityVersion ? `${label}/${pkg.unityVersion}` : label;
            if (!platforms.includes(display)) {
                platforms.push(display);
            }
        }
        return platforms.join('\n');
    });

    const worldDialogPlatformCreatedAt = computed(() => {
        const { ref } = worldDialog.value;
        if (!ref.unityPackages) {
            return null;
        }
        let newest = {};
        for (const unityPackage of ref.unityPackages) {
            if (unityPackage.variant && unityPackage.variant !== 'standard' && unityPackage.variant !== 'security') {
                continue;
            }
            const platform = unityPackage.platform;
            const createdAt = unityPackage.created_at;
            if (!newest[platform] || new Date(createdAt) > new Date(newest[platform])) {
                newest[platform] = createdAt;
            }
        }
        return newest;
    });

    function copyWorldId() {
        navigator.clipboard
            .writeText(worldDialog.value.id)
            .then(() => {
                toast.success(t('message.world.id_copied'));
            })
            .catch((err) => {
                console.error('copy failed:', err);
                toast.error(t('message.copy_failed'));
            });
    }

    function copyWorldUrl() {
        navigator.clipboard
            .writeText(`https://nexvr.net/worlds/${worldDialog.value.id}`)
            .then(() => {
                toast.success(t('message.world.url_copied'));
            })
            .catch((err) => {
                console.error('copy failed:', err);
                toast.error(t('message.copy_failed'));
            });
    }

    function copyWorldName() {
        navigator.clipboard
            .writeText(worldDialog.value.ref.name)
            .then(() => {
                toast.success(t('message.world.name_copied'));
            })
            .catch((err) => {
                console.error('copy failed:', err);
                toast.error(t('message.copy_failed'));
            });
    }

    return {
        memo,
        favoriteRate,
        worldTags,
        worldDialogPlatform,
        worldDialogPlatformCreatedAt,
        onWorldMemoChange,
        copyWorldId,
        copyWorldUrl,
        copyWorldName,
        commaNumber,
        formatDateFilter
    };
}

/**
 * @param {import('vue').Ref} worldDialog - Reactive ref to the world dialog state
 * @returns {object} Memo composable API
 */
export function useWorldMemo(worldDialog) {
    const memo = computed({
        get() {
            return worldDialog.value.memo;
        },
        set(value) {
            worldDialog.value.memo = value;
        }
    });

    function onWorldMemoChange() {
        const worldId = worldDialog.value.id;
        const memo = worldDialog.value.memo;
        if (memo) {
            database.setWorldMemo({
                worldId,
                editedAt: new Date().toJSON(),
                memo
            });
        } else {
            database.deleteWorldMemo(worldId);
        }
    }

    return {
        memo,
        onWorldMemoChange
    };
}
