import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import en from '@/localization/en.json';
import InstanceDialogContent from '../InstanceDialogContent.vue';

const dateSettings = vi.hoisted(() => ({ dtIsoFormat: true, dtHour12: false, currentCulture: 'en-US' }));
vi.mock('@/stores', () => ({ useAppearanceSettingsStore: () => dateSettings }));

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
    $nexvr: { detailsFetched: true, contentMode: 'nsfw_plus', creatorName: 'Iris', ephemeral: true, region: 'ca' }
};

/** Mount visible dialog controls with real translations and configurable instance data. */
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
    beforeEach(() => {
        dateSettings.dtIsoFormat = true;
        dateSettings.dtHour12 = false;
    });

    it('uses the app date and hour-format preferences', () => {
        const createdAt = new Date(2026, 10, 1, 13, 18, 0).toISOString();
        const props = { instance: { ...instance, $nexvr: { ...instance.$nexvr, createdAt } } };
        expect(render(props).text()).toContain('2026-11-01 13:18:00');
        dateSettings.dtIsoFormat = false;
        dateSettings.dtHour12 = true;
        const local = render(props);
        expect(local.text()).toContain('11/01/2026');
        expect(local.text()).toContain('PM');
        expect(local.text()).not.toContain('2026-11-01 13:18:00');
    });

    it('keeps unknown values for missing or invalid dates', () => {
        const wrapper = render({
            instance: { ...instance, $nexvr: { ...instance.$nexvr, createdAt: null, closesAt: 'invalid' } }
        });
        const values = wrapper.findAll('dd');
        expect(values[4].text()).toBe('Unknown');
        expect(values[5].text()).toBe('Unknown');
    });
    it('shows the creator separately from the world author and group owner', () => {
        const wrapper = render();
        expect(wrapper.text()).toContain('Iris');
        expect(wrapper.text()).toContain('World Author');
        expect(wrapper.text()).toContain('ERP');
        expect(wrapper.text()).toContain('0 / 32');
        expect(wrapper.text()).toContain('Temporary');
    });

    it.each([false, undefined])(
        'keeps lifetime and closing schedule unknown without fetched details (%s)',
        (detailsFetched) => {
            const wrapper = render({
                instance: { ...instance, $nexvr: { contentMode: 'sfw', ephemeral: false, detailsFetched } }
            });
            const values = wrapper.findAll('dd');
            expect(values[3].text()).toBe('Unknown');
            expect(values[5].text()).toBe('Unknown');
            expect(wrapper.text()).not.toContain('Persistent');
        }
    );

    it('shows persistent lifetime and an unscheduled close only after details are fetched', () => {
        const wrapper = render({ instance: { ...instance, $nexvr: { detailsFetched: true, ephemeral: false } } });
        const values = wrapper.findAll('dd');
        expect(values[3].text()).toBe('Persistent');
        expect(values[5].text()).toBe('Not scheduled');
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

    it('keeps the launch flow available when uncached instance details fail to load', async () => {
        const wrapper = render({ instance: null, world: null, error: true });
        const join = wrapper.findAll('button').find((button) => button.text() === 'Join instance');
        expect(join.attributes('disabled')).toBeUndefined();
        await join.trigger('click');
        expect(wrapper.emitted('join')).toHaveLength(1);
        expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    });

    it('keeps Join disabled while uncached instance details are loading', () => {
        const wrapper = render({ instance: null, loading: true });
        const join = wrapper.findAll('button').find((button) => button.text() === 'Join instance');
        expect(join.attributes('disabled')).toBeDefined();
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
