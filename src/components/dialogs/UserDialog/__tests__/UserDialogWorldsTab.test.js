import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('vue-i18n', () => {
    const { ref } = require('vue');
    return {
        useI18n: () => ({
            t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
            locale: ref('en')
        }),
        createI18n: () => ({
            global: { t: (key) => key, locale: ref('en') },
            install: vi.fn()
        })
    };
});

vi.mock('../../../../plugins/router', () => {
    const { ref } = require('vue');
    return {
        router: {
            beforeEach: vi.fn(),
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} }),
            isReady: vi.fn().mockResolvedValue(true)
        },
        initRouter: vi.fn()
    };
});
vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal();
    const { ref } = require('vue');
    return {
        ...actual,
        useRouter: vi.fn(() => ({
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} })
        }))
    };
});
vi.mock('../../../../plugins/interopApi', () => ({ initInteropApi: vi.fn() }));
vi.mock('../../../../services/database', () => ({
    database: new Proxy(
        {},
        {
            get: (_target, prop) => {
                if (prop === '__esModule') return false;
                return vi.fn().mockResolvedValue(null);
            }
        }
    )
}));
vi.mock('../../../../services/config', () => ({
    default: {
        init: vi.fn(),
        getString: vi.fn().mockImplementation((_k, d) => d ?? '{}'),
        setString: vi.fn(),
        getBool: vi.fn().mockImplementation((_k, d) => d ?? false),
        setBool: vi.fn(),
        getInt: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setInt: vi.fn(),
        getFloat: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setFloat: vi.fn(),
        getObject: vi.fn().mockReturnValue(null),
        setObject: vi.fn(),
        getArray: vi.fn().mockReturnValue([]),
        setArray: vi.fn(),
        remove: vi.fn()
    }
}));
vi.mock('../../../../services/jsonStorage', () => ({ default: vi.fn() }));
vi.mock('../../../../services/watchState', () => ({
    watchState: { isLoggedIn: false }
}));
// The real module reads debounce from shared/utils while that index is still
// loading through a circular import, so the suite fails before any test runs
vi.mock('../../../../services/websocket', () => ({
    initWebsocket: vi.fn(),
    closeWebSocket: vi.fn(),
    reconnectWebSocket: vi.fn(),
    wsState: {}
}));
vi.mock('../../../../services/request', () => ({
    request: vi.fn().mockResolvedValue({ json: {} }),
    processBulk: vi.fn(),
    buildRequestInit: vi.fn(),
    parseResponse: vi.fn(),
    shouldIgnoreError: vi.fn(),
    $throw: vi.fn(),
    failedGetRequests: new Map()
}));

vi.mock('../../../../coordinators/worldCoordinator', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, showWorldDialog: vi.fn() };
});

vi.mock('../../../../api', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        queryRequest: { ...actual.queryRequest, fetch: vi.fn() }
    };
});

import UserDialogWorldsTab from '../UserDialogWorldsTab.vue';
import { useUserStore } from '../../../../stores';
import { queryRequest } from '../../../../api';
import { userDialogWorldSortingOptions, userDialogWorldOrderOptions } from '../../../../shared/constants';

// ─── Helpers ─────────────────────────────────────────────────────────

const MOCK_WORLDS = [
    {
        id: 'wrld_1',
        name: 'Sunset Valley',
        thumbnailImageUrl: 'https://img/world1.png',
        occupants: 12,
        authorId: 'usr_me'
    },
    {
        id: 'wrld_2',
        name: 'Midnight Club',
        thumbnailImageUrl: 'https://img/world2.png',
        occupants: 5,
        authorId: 'usr_me'
    },
    {
        id: 'wrld_3',
        name: 'Cozy Cottage',
        thumbnailImageUrl: 'https://img/world3.png',
        occupants: 0,
        authorId: 'usr_me'
    }
];

/**
 * @param overrides
 */
function mountComponent(overrides = {}) {
    const pinia = createTestingPinia({
        stubActions: false
    });

    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            id: 'usr_me',
            ref: { id: 'usr_me' },
            worlds: [...MOCK_WORLDS],
            worldSorting: userDialogWorldSortingOptions.name,
            worldOrder: userDialogWorldOrderOptions.descending,
            isWorldsLoading: false,
            worldsRequestId: 0,
            worldsRequestUserId: null,
            ...overrides
        },
        currentUser: {
            id: 'usr_me',
            ...overrides.currentUser
        }
    });

    return mount(UserDialogWorldsTab, {
        global: {
            plugins: [pinia],
            stubs: {
                RefreshCw: { template: '<svg class="refresh-icon" />' }
            }
        }
    });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('UserDialogWorldsTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        test('renders world count', () => {
            const wrapper = mountComponent();
            expect(wrapper.text()).toContain('3');
        });

        test('renders world names', () => {
            const wrapper = mountComponent();
            expect(wrapper.text()).toContain('Sunset Valley');
            expect(wrapper.text()).toContain('Midnight Club');
            expect(wrapper.text()).toContain('Cozy Cottage');
        });

        test('renders world thumbnail images', () => {
            const wrapper = mountComponent();
            const images = wrapper.findAll('img');
            expect(images).toHaveLength(3);
            expect(images[0].attributes('src')).toBe('https://img/world1.png');
        });

        test('renders occupant count for worlds with occupants', () => {
            const wrapper = mountComponent();
            expect(wrapper.text()).toContain('12');
            expect(wrapper.text()).toContain('5');
        });

        test('renders empty state when no worlds and not loading', () => {
            const wrapper = mountComponent({ worlds: [] });
            expect(wrapper.text()).toContain('0');
        });
    });

    describe('loading state', () => {
        test('disables refresh button when loading', () => {
            const wrapper = mountComponent({ isWorldsLoading: true });
            const button = wrapper.find('button');
            expect(button.attributes('disabled')).toBeDefined();
        });

        test('refresh button is enabled when not loading', () => {
            const wrapper = mountComponent({ isWorldsLoading: false });
            const button = wrapper.find('button');
            expect(button.attributes('disabled')).toBeUndefined();
        });
    });

    describe('refreshUserDialogWorlds requests', () => {
        function deferred() {
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        }

        /**
         * Each fetch returns the next pending request, so a test settles them
         * in whatever order it wants to exercise
         */
        function queueWorldRequests(count) {
            const requests = Array.from({ length: count }, deferred);
            let index = 0;
            queryRequest.fetch.mockImplementation(() => requests[index++].promise);
            return requests;
        }

        function worldsResponse(...names) {
            return { json: names.map((name) => ({ id: `wrld_${name}`, name })) };
        }

        function worldNames(userStore) {
            return userStore.userDialog.worlds.map((world) => world.name);
        }

        test('ignores an older user’s worlds that return after the newer user loaded', async () => {
            const [requestA, requestB] = queueWorldRequests(2);
            const wrapper = mountComponent({ id: 'usr_a', worlds: [] });
            const userStore = useUserStore();

            wrapper.vm.refreshUserDialogWorlds();
            userStore.userDialog.id = 'usr_b';
            // A pending request for A must not block the one for B
            wrapper.vm.refreshUserDialogWorlds();
            expect(queryRequest.fetch).toHaveBeenCalledTimes(2);

            requestB.resolve(worldsResponse('Beta'));
            await flushPromises();
            requestA.resolve(worldsResponse('Alpha'));
            await flushPromises();

            expect(worldNames(userStore)).toEqual(['Beta']);
            expect(userStore.userDialog.isWorldsLoading).toBe(false);
        });

        test('keeps only the latest response when switching A → B → A', async () => {
            const [firstA, requestB, secondA] = queueWorldRequests(3);
            const wrapper = mountComponent({ id: 'usr_a', worlds: [] });
            const userStore = useUserStore();

            wrapper.vm.refreshUserDialogWorlds();
            userStore.userDialog.id = 'usr_b';
            wrapper.vm.refreshUserDialogWorlds();
            userStore.userDialog.id = 'usr_a';
            wrapper.vm.refreshUserDialogWorlds();
            expect(queryRequest.fetch).toHaveBeenCalledTimes(3);

            secondA.resolve(worldsResponse('Fresh'));
            await flushPromises();
            // The first A response passes the user check now the dialog is back
            // on A, so only the request id can reject it
            firstA.resolve(worldsResponse('Stale'));
            requestB.resolve(worldsResponse('Beta'));
            await flushPromises();

            expect(worldNames(userStore)).toEqual(['Fresh']);
            expect(userStore.userDialog.isWorldsLoading).toBe(false);
        });

        test('a stale request settling first leaves the newer request loading', async () => {
            const [requestA, requestB] = queueWorldRequests(2);
            const wrapper = mountComponent({ id: 'usr_a', worlds: [] });
            const userStore = useUserStore();

            wrapper.vm.refreshUserDialogWorlds();
            userStore.userDialog.id = 'usr_b';
            wrapper.vm.refreshUserDialogWorlds();

            requestA.resolve(worldsResponse('Alpha'));
            await flushPromises();
            expect(userStore.userDialog.isWorldsLoading).toBe(true);
            expect(worldNames(userStore)).toEqual([]);

            requestB.resolve(worldsResponse('Beta'));
            await flushPromises();
            expect(userStore.userDialog.isWorldsLoading).toBe(false);
            expect(worldNames(userStore)).toEqual(['Beta']);
        });

        test('does not start a second request for the user already loading', async () => {
            const [request] = queueWorldRequests(1);
            const wrapper = mountComponent({ id: 'usr_a', worlds: [] });

            wrapper.vm.refreshUserDialogWorlds();
            wrapper.vm.refreshUserDialogWorlds();
            expect(queryRequest.fetch).toHaveBeenCalledTimes(1);

            request.resolve(worldsResponse('Alpha'));
            await flushPromises();
            expect(worldNames(useUserStore())).toEqual(['Alpha']);
        });

        test('clears loading after a rejected request and loads again on retry', async () => {
            const [failed, retry] = queueWorldRequests(2);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const wrapper = mountComponent({ id: 'usr_a', worlds: [] });
            const userStore = useUserStore();

            wrapper.vm.refreshUserDialogWorlds();
            failed.reject(new Error('network down'));
            await flushPromises();
            expect(userStore.userDialog.isWorldsLoading).toBe(false);
            expect(consoleError).toHaveBeenCalledWith('refreshUserDialogWorlds failed', expect.any(Error));

            wrapper.vm.refreshUserDialogWorlds();
            retry.resolve(worldsResponse('Alpha'));
            await flushPromises();
            expect(worldNames(userStore)).toEqual(['Alpha']);
            expect(userStore.userDialog.isWorldsLoading).toBe(false);
            consoleError.mockRestore();
        });
    });
});
