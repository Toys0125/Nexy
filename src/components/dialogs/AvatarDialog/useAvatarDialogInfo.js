import { computed } from 'vue';

const PLATFORM_LABELS = {
    standalonewindows: 'PC',
    android: 'Android',
    ios: 'iOS',
    standalonelinux: 'Linux',
    standaloneosx: 'macOS'
};

/**
 * @param {import('vue').Ref<object>} avatarDialog
 */
export function useAvatarDialogInfo(avatarDialog) {
    const avatarDialogPlatform = computed(() => {
        const platforms = [];
        for (const pkg of avatarDialog.value.ref?.unityPackages || []) {
            if (pkg.variant && pkg.variant !== 'standard' && pkg.variant !== 'security') {
                continue;
            }
            if (!pkg.platform) {
                continue;
            }
            const label = PLATFORM_LABELS[pkg.platform] || pkg.platform;
            // NexVR packages report platforms without a VRChat SDK or Unity version.
            const display = pkg.unityVersion ? `${label}/${pkg.unityVersion}` : label;
            if (!platforms.includes(display)) {
                platforms.push(display);
            }
        }
        return platforms.join('\n');
    });

    const avatarTags = computed(() =>
        avatarDialog.value.ref?.tags
            ?.filter((tag) => tag.startsWith('author_tag_'))
            .map((tag) => tag.slice('author_tag_'.length))
            .join(', ')
    );

    return { avatarDialogPlatform, avatarTags };
}
