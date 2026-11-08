import { ref } from 'vue';

import { toNexVRAvatar } from '../../../../services/nexvr/mappers';
import { getAvailablePlatforms } from '../../../../shared/utils/platformUtils';
import { useAvatarDialogInfo } from '../useAvatarDialogInfo';

describe('avatar dialog metadata', () => {
    test('shows NexVR content tags and platforms from the selected version', () => {
        const avatar = toNexVRAvatar({
            id: 'avatar',
            contentTags: ['avali', 'furry'],
            system_tags: ['public_featured'],
            currentVersion: 'current',
            versions: [
                { versionNumber: 'current', package: { platforms: ['StandaloneWindows64', 'Android'] } },
                { versionNumber: 'other', package: { platforms: ['StandaloneLinux64'] } }
            ]
        });
        const { avatarDialogPlatform, avatarTags } = useAvatarDialogInfo(ref({ ref: avatar }));

        expect(avatarDialogPlatform.value).toBe('PC\nAndroid');
        expect(avatarTags.value).toBe('avali, furry');
        expect(avatar.tags).toContain('public_featured');
        expect(getAvailablePlatforms(avatar.unityPackages)).toEqual({ isPC: true, isQuest: true, isIos: false });
    });

    test('updates when selecting another avatar, including one with no metadata', () => {
        const dialog = ref({ ref: toNexVRAvatar({ id: 'first', contentTags: ['furry'] }) });
        const { avatarDialogPlatform, avatarTags } = useAvatarDialogInfo(dialog);
        expect(avatarTags.value).toBe('furry');

        dialog.value.ref = toNexVRAvatar({
            id: 'next',
            versions: [{ package: { platforms: ['StandaloneLinux64', 'StandaloneOSX', 'Generic'] } }]
        });
        expect(avatarTags.value).toBe('');
        expect(avatarDialogPlatform.value).toBe('Linux\nmacOS\nGeneric');

        dialog.value.ref = toNexVRAvatar({ id: 'empty' });
        expect(avatarDialogPlatform.value).toBe('');
        expect(avatarTags.value).toBe('');
    });

    test('deduplicates standard packages, skips impostors and displays supplied Unity versions', () => {
        const { avatarDialogPlatform } = useAvatarDialogInfo(
            ref({
                ref: {
                    unityPackages: [
                        { platform: 'standalonewindows', variant: 'standard', unityVersion: '2022.3.6f1' },
                        { platform: 'standalonewindows', variant: 'security', unityVersion: '2022.3.6f1' },
                        { platform: 'android', variant: 'impostor' },
                        { platform: 'ios' }
                    ]
                }
            })
        );
        expect(avatarDialogPlatform.value).toBe('PC/2022.3.6f1\niOS');
    });
});
