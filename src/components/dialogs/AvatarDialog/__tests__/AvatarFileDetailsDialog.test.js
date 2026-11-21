import { flushPromises, mount } from '@vue/test-utils';

import { i18n } from '@/plugins/i18n';
import { copyToClipboard } from '@/shared/utils/appActions';
import AvatarFileDetailsDialog from '../AvatarFileDetailsDialog.vue';

vi.mock('@/shared/utils/appActions', () => ({ copyToClipboard: vi.fn() }));
vi.mock('@/stores/settings/general', () => ({ useGeneralSettingsStore: () => ({}) }));

test('shows the active version and lets owners reveal and copy the file details', async () => {
    const url = 'https://nexvr.net/api/files/avatars/a1/2?t=example';
    const key = 'example-key';
    const wrapper = mount(AvatarFileDetailsDialog, {
        props: {
            details: {
                currentVersion: '2',
                versions: [
                    { versionNumber: '2', url, decryptionKey: key },
                    { versionNumber: '3', url: 'https://example.com/v3.bee' }
                ]
            }
        },
        global: { plugins: [i18n] },
        attachTo: document.body
    });

    const click = async (selector) => {
        const button = document.querySelector(selector);
        expect(button).not.toBeNull();
        button.click();
        await flushPromises();
    };

    try {
        expect(document.querySelector('input[type="password"]')).toBeNull();
        await wrapper.get('button').trigger('click');
        await flushPromises();

        expect(document.querySelector('input[type="password"]').value).toBe(key);
        await click('[aria-label="Copy download URL"]');
        await click('[aria-label="Copy decryption key"]');
        expect(copyToClipboard.mock.calls).toEqual([[url], [key]]);

        const reveal = [...document.querySelectorAll('button')].find(
            (button) => button.textContent === 'Toggle password'
        );
        reveal.click();
        await flushPromises();
        expect(document.querySelector('input[type="password"]')).toBeNull();
        expect(
            [...document.querySelectorAll('input')].some((input) => input.value === key && input.type === 'text')
        ).toBe(true);

        await click('[data-slot="dialog-close"]');
        expect([...document.querySelectorAll('input')].some((input) => input.value === key)).toBe(false);
        await wrapper.get('button').trigger('click');
        await flushPromises();
        expect(document.querySelector('input[type="password"]').value).toBe(key);
    } finally {
        wrapper.unmount();
    }
});
