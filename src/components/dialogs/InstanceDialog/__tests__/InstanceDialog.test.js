import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import en from '@/localization/en.json';

const mocks = vi.hoisted(() => ({
    instanceDialog: null,
    lastInstanceApplied: null,
    cached: new Map(),
    fetchInstanceDetails: vi.fn(),
    getWorld: vi.fn(),
    showLaunchDialog: vi.fn(),
    setDialogCrumbLabel: vi.fn()
}));
vi.mock('pinia', () => ({ storeToRefs: (store) => store }));
vi.mock('@/api', () => ({ worldRequest: { getWorld: mocks.getWorld } }));
vi.mock('@/stores', () => ({
    useInstanceStore: () => ({ instanceDialog: mocks.instanceDialog, lastInstanceApplied: mocks.lastInstanceApplied }),
    useUiStore: () => ({ setDialogCrumbLabel: mocks.setDialogCrumbLabel, closeMainDialog: vi.fn() }),
    useLaunchStore: () => ({ showLaunchDialog: mocks.showLaunchDialog }),
    useFriendStore: () => ({ friends: new Map() }),
    useUserStore: () => ({ cachedUsers: new Map() }),
    useAppearanceSettingsStore: () => ({ dtIsoFormat: true, dtHour12: false, currentCulture: 'en-US' })
}));
vi.mock('@/coordinators/instanceCoordinator', () => ({
    fetchInstanceDetails: mocks.fetchInstanceDetails,
    getCachedInstance: (location) => mocks.cached.get(location)
}));
vi.mock('@/coordinators/worldCoordinator', () => ({ showWorldDialog: vi.fn() }));
vi.mock('@/coordinators/userCoordinator', () => ({ showUserDialog: vi.fn() }));
vi.mock('@/shared/utils/appActions', () => ({ copyToClipboard: vi.fn() }));

import InstanceDialog from '../InstanceDialog.vue';
import InstanceDialogContent from '../InstanceDialogContent.vue';

const location = 'world:first~region(ca)';
let wrappers;

/** Control transport completion independently from the dialog's deadline. */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

/** Mount the loading controller with its real visible Join and retry controls. */
function render() {
    const wrapper = mount(InstanceDialog, {
        global: {
            plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
            stubs: {
                DialogTitle: { template: '<h1><slot /></h1>' },
                DialogDescription: { template: '<p><slot /></p>' }
            }
        }
    });
    wrappers.push(wrapper);
    return wrapper;
}

/** Find the actual action button by its translated label. */
function button(wrapper, label) {
    return wrapper.findAll('button').find((item) => item.text() === label);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    wrappers = [];
    mocks.cached.clear();
    mocks.instanceDialog = ref({ location, shortName: 'short' });
    mocks.lastInstanceApplied = ref('');
    mocks.fetchInstanceDetails.mockReset();
    mocks.getWorld.mockReset();
});
afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    vi.useRealTimers();
});

it.each(['instance', 'world', 'both'])(
    'enables the known-location launch flow after one deadline when %s stalls',
    async (stalled) => {
        const instance = deferred();
        const world = deferred();
        mocks.fetchInstanceDetails.mockReturnValue(instance.promise);
        mocks.getWorld.mockReturnValue(world.promise);
        const wrapper = render();
        if (stalled === 'world') instance.resolve({ location, displayName: 'Available instance' });
        if (stalled === 'instance') world.resolve({ ref: { name: 'Available world' } });
        await flushPromises();
        if (stalled === 'world') expect(wrapper.text()).toContain('Available instance');
        if (stalled === 'instance') expect(wrapper.text()).toContain('Available world');
        await vi.advanceTimersByTimeAsync(9999);
        expect(button(wrapper, 'Join instance').attributes('disabled')).toBeDefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
        expect(wrapper.find('[role="alert"]').exists()).toBe(true);
        await button(wrapper, 'Join instance').trigger('click');
        expect(mocks.showLaunchDialog).toHaveBeenCalledWith(location, 'short');
        expect(vi.getTimerCount()).toBe(0);
    }
);

it.each([{ full: true }, { active: false }])(
    'preserves cached availability restrictions after the deadline: %j',
    async (state) => {
        mocks.cached.set(location, { location, ...state });
        mocks.fetchInstanceDetails.mockReturnValue(new Promise(() => {}));
        mocks.getWorld.mockReturnValue(new Promise(() => {}));
        const wrapper = render();
        await vi.advanceTimersByTimeAsync(10000);
        const join = wrapper.findAll('button').find((item) => /Instance full|Closed/.test(item.text()));
        expect(join.attributes('disabled')).toBeDefined();
        expect(mocks.showLaunchDialog).not.toHaveBeenCalled();
    }
);

it('applies late current results independently without re-entering loading', async () => {
    const instance = deferred();
    const world = deferred();
    mocks.fetchInstanceDetails.mockReturnValue(instance.promise);
    mocks.getWorld.mockReturnValue(world.promise);
    const wrapper = render();
    await vi.advanceTimersByTimeAsync(10000);
    instance.resolve({ location, displayName: 'Late instance', full: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Late instance');
    expect(button(wrapper, 'Instance full').attributes('disabled')).toBeDefined();
    expect(wrapper.findComponent(InstanceDialogContent).props('loading')).toBe(false);
    world.resolve({ ref: { name: 'Late world' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Late world');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});

it('gives a newer selection its own deadline and rejects results from the old selection', async () => {
    const oldInstance = deferred();
    const oldWorld = deferred();
    const newInstance = deferred();
    const newWorld = deferred();
    mocks.fetchInstanceDetails.mockReturnValueOnce(oldInstance.promise).mockReturnValueOnce(newInstance.promise);
    mocks.getWorld.mockReturnValueOnce(oldWorld.promise).mockReturnValueOnce(newWorld.promise);
    const wrapper = render();
    await vi.advanceTimersByTimeAsync(9000);
    const nextLocation = 'world:second';
    mocks.instanceDialog.value = { location: nextLocation, shortName: 'second-short' };
    await nextTick();
    oldInstance.resolve({ location, displayName: 'Old instance' });
    oldWorld.resolve({ ref: { name: 'Old world' } });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.findComponent(InstanceDialogContent).props('loading')).toBe(true);
    expect(wrapper.text()).not.toContain('Old instance');
    expect(wrapper.text()).not.toContain('Old world');
    expect(mocks.setDialogCrumbLabel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(9000);
    expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
    newInstance.resolve({ location: nextLocation, displayName: 'New instance' });
    newWorld.resolve({ ref: { name: 'New world' } });
    await flushPromises();
    expect(wrapper.text()).toContain('New instance');
    expect(wrapper.text()).toContain('New world');
    expect(mocks.setDialogCrumbLabel).toHaveBeenCalledExactlyOnceWith('instance', nextLocation, 'New instance');
});

it('ignores old completions during a forced refresh of the same selection', async () => {
    const oldInstance = deferred();
    const oldWorld = deferred();
    const newInstance = deferred();
    const newWorld = deferred();
    mocks.fetchInstanceDetails.mockReturnValueOnce(oldInstance.promise).mockReturnValueOnce(newInstance.promise);
    mocks.getWorld.mockReturnValueOnce(oldWorld.promise).mockReturnValueOnce(newWorld.promise);
    const wrapper = render();
    await vi.advanceTimersByTimeAsync(10000);
    await button(wrapper, 'Try again').trigger('click');
    expect(mocks.fetchInstanceDetails).toHaveBeenLastCalledWith(location, true);
    oldInstance.resolve({ location, displayName: 'Old instance' });
    oldWorld.resolve({ ref: { name: 'Old world' } });
    await flushPromises();
    expect(wrapper.findComponent(InstanceDialogContent).props('loading')).toBe(true);
    expect(wrapper.text()).not.toContain('Old instance');
    expect(wrapper.text()).not.toContain('Old world');
    newInstance.resolve({ location, displayName: 'Refreshed instance' });
    newWorld.resolve({ ref: { name: 'Refreshed world' } });
    await flushPromises();
    expect(wrapper.text()).toContain('Refreshed instance');
    expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
});

it('cleans up the deadline and ignores completions after unmounting', async () => {
    const instance = deferred();
    const world = deferred();
    mocks.fetchInstanceDetails.mockReturnValue(instance.promise);
    mocks.getWorld.mockReturnValue(world.promise);
    const wrapper = render();
    wrapper.unmount();
    wrappers = [];
    expect(vi.getTimerCount()).toBe(0);
    instance.resolve({ location, displayName: 'Unmounted instance' });
    world.resolve({ ref: { name: 'Unmounted world' } });
    await flushPromises();
    expect(mocks.setDialogCrumbLabel).not.toHaveBeenCalled();
});

it('ends loading immediately on settled failures without waiting for the deadline', async () => {
    mocks.fetchInstanceDetails.mockRejectedValue(new Error('Offline'));
    mocks.getWorld.mockResolvedValue({ ref: { name: 'Available world' } });
    const wrapper = render();
    await flushPromises();
    expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
});

it.each(['instance', 'world'])(
    'handles a synchronous %s request failure and still applies the other result',
    async (failed) => {
        mocks.fetchInstanceDetails.mockResolvedValue({ location, displayName: 'Available instance' });
        mocks.getWorld.mockResolvedValue({ ref: { name: 'Available world' } });
        const throwCachedFailure = () => {
            throw new Error('Cached 403/404');
        };
        if (failed === 'instance') mocks.fetchInstanceDetails.mockImplementationOnce(throwCachedFailure);
        else mocks.getWorld.mockImplementationOnce(throwCachedFailure);
        const wrapper = render();
        await flushPromises();
        expect(wrapper.find('[role="alert"]').exists()).toBe(true);
        expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
        expect(wrapper.text()).toContain(failed === 'instance' ? 'Available world' : 'Available instance');
        expect(vi.getTimerCount()).toBe(0);
    }
);

it('handles unexpected setup errors without leaving a rejected watched load', async () => {
    const read = vi.spyOn(mocks.cached, 'get').mockImplementationOnce(() => {
        throw new Error('Cache failure');
    });
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(button(wrapper, 'Join instance').attributes('disabled')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    read.mockRestore();
});
