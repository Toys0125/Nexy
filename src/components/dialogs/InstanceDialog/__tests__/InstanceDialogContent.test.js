import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import en from '@/localization/en.json';
import InstanceDialogContent from '../InstanceDialogContent.vue';

const location = 'world:instance~region(ca)';
const instance = {
    location,
    displayName: 'Evening hangout',
    creatorId: 'owner',
    ownerId: 'group',
    type: 'group',
    userCount: 0,
    capacity: 32,
    active: true,
    $nexvr: { contentMode: 'nsfw_plus', creatorName: 'Iris', ephemeral: true, region: 'ca' }
};

function render(props = {}) {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });
    // Stub only the dialog accessibility primitives; render all visible controls.
    return mount(InstanceDialogContent, {
        props: { location, instance, world: { name: 'Cozy World', authorName: 'World Author' }, ...props },
        global: {
            plugins: [i18n],
            stubs: {
                DialogTitle: { template: '<h1><slot /></h1>' },
                DialogDescription: { template: '<p><slot /></p>' }
            }
        }
    });
}

describe('InstanceDialogContent', () => {
    it('shows the creator separately from the world author and group owner', () => {
        const wrapper = render();
        expect(wrapper.text()).toContain('Iris');
        expect(wrapper.text()).toContain('World Author');
        expect(wrapper.text()).toContain('ERP');
        expect(wrapper.text()).toContain('0 / 32');
        expect(wrapper.text()).toContain('Temporary');
    });

    it('opens the creator profile and forwards all detail actions', async () => {
        const wrapper = render();
        const click = async (text) =>
            wrapper
                .findAll('button')
                .find((button) => button.text().includes(text))
                .trigger('click');
        await click('Iris');
        await click('View world');
        await click('Join instance');
        await click('Copy link');
        expect(wrapper.emitted('owner')).toEqual([['owner']]);
        expect(wrapper.emitted('world')).toHaveLength(1);
        expect(wrapper.emitted('join')).toHaveLength(1);
        expect(wrapper.emitted('copy')).toHaveLength(1);
    });

    it.each([{ closedAt: '2026-11-01T13:00:00Z' }, { full: true }, { active: false }])(
        'disables joining an unavailable instance: %j',
        (overrides) => {
            const wrapper = render({ instance: { ...instance, ...overrides } });
            expect(
                wrapper
                    .findAll('button')
                    .some(
                        (button) =>
                            button.attributes('disabled') !== undefined && /Closed|Instance full/.test(button.text())
                    )
            ).toBe(true);
        }
    );

    it('shows an error and a retry action, with unknown content when no data is available', async () => {
        const wrapper = render({ instance: null, error: true });
        expect(wrapper.find('[role="alert"]').exists()).toBe(true);
        expect(wrapper.text()).toContain('Content unknown');
        await wrapper
            .findAll('button')
            .find((button) => button.text() === 'Try again')
            .trigger('click');
        expect(wrapper.emitted('refresh')).toHaveLength(1);
        expect(wrapper.text()).not.toContain('SFW');
    });

    it('only displays supplied friends and opens their profiles', async () => {
        const wrapper = render({ friends: [{ id: 'friend-id', displayName: 'Friend' }] });
        expect(wrapper.text()).toContain('Friends here (1)');
        await wrapper
            .findAll('button')
            .find((button) => button.text() === 'Friend')
            .trigger('click');
        expect(wrapper.emitted('user')).toEqual([['friend-id']]);
    });
});
