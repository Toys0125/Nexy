import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('vue-i18n', () => {
    const { ref } = require('vue');
    return {
        useI18n: () => ({
            t: (key) => key,
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

vi.mock('../../../../api', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        groupRequest: { ...actual.groupRequest, getGroups: vi.fn() }
    };
});

vi.mock('../../../../coordinators/groupCoordinator', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        applyGroup: vi.fn((group) => group),
        handleGroupList: vi.fn(),
        saveCurrentUserGroups: vi.fn()
    };
});

import UserDialogGroupsTab from '../UserDialogGroupsTab.vue';
import { useUserStore } from '../../../../stores';
import { groupRequest } from '../../../../api';
import { handleGroupList } from '../../../../coordinators/groupCoordinator';
import { userDialogGroupSortingOptions } from '../../../../shared/constants';

// ─── Helpers ─────────────────────────────────────────────────────────

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function groupsResponse(userId, names) {
    return {
        json: names.map((name) => ({ id: `grp_${name}`, groupId: `grp_${name}`, name, ownerId: 'usr_other' })),
        params: { userId }
    };
}

/**
 * Each call to groupRequest.getGroups returns the next pending request, so a
 * test settles them in whatever order it wants to exercise
 */
function queueGroupRequests(count) {
    const requests = Array.from({ length: count }, deferred);
    let index = 0;
    groupRequest.getGroups.mockImplementation(() => requests[index++].promise);
    return requests;
}

function mountComponent() {
    const pinia = createTestingPinia({ stubActions: false });
    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            id: 'usr_a',
            ref: { id: 'usr_a' },
            isGroupsLoading: false,
            groupsRequestId: 0,
            groupSorting: userDialogGroupSortingOptions.alphabetical,
            userGroups: { groups: [], ownGroups: [], mutualGroups: [], remainingGroups: [] }
        },
        currentUser: { id: 'usr_me' }
    });
    const wrapper = mount(UserDialogGroupsTab, {
        global: { plugins: [pinia] }
    });
    return { wrapper, userStore };
}

function groupNames(userStore) {
    return userStore.userDialog.userGroups.groups.map((group) => group.name);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('UserDialogGroupsTab.vue getUserGroups', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('ignores an older response that returns after a newer user was loaded', async () => {
        const [requestA, requestB] = queueGroupRequests(2);
        const { wrapper, userStore } = mountComponent();

        const loadA = wrapper.vm.getUserGroups('usr_a');
        userStore.userDialog.id = 'usr_b';
        const loadB = wrapper.vm.getUserGroups('usr_b');

        requestB.resolve(groupsResponse('usr_b', ['Beta']));
        await loadB;
        requestA.resolve(groupsResponse('usr_a', ['Alpha']));
        await loadA;

        expect(groupNames(userStore)).toEqual(['Beta']);
        expect(handleGroupList).toHaveBeenCalledTimes(1);
        expect(userStore.userDialog.isGroupsLoading).toBe(false);
    });

    test('keeps only the latest response when switching A → B → A', async () => {
        const [firstA, requestB, secondA] = queueGroupRequests(3);
        const { wrapper, userStore } = mountComponent();

        const loadFirstA = wrapper.vm.getUserGroups('usr_a');
        userStore.userDialog.id = 'usr_b';
        const loadB = wrapper.vm.getUserGroups('usr_b');
        userStore.userDialog.id = 'usr_a';
        const loadSecondA = wrapper.vm.getUserGroups('usr_a');

        secondA.resolve(groupsResponse('usr_a', ['Fresh']));
        await loadSecondA;
        // Both older requests pass the user check once the dialog is back on A
        // or would for B, so only the request id can reject them
        firstA.resolve(groupsResponse('usr_a', ['Stale']));
        requestB.resolve(groupsResponse('usr_b', ['Beta']));
        await Promise.all([loadFirstA, loadB]);

        expect(groupNames(userStore)).toEqual(['Fresh']);
        expect(handleGroupList).toHaveBeenCalledTimes(1);
    });

    test('does not cache groups for a user the dialog left on another tab', async () => {
        const [requestA] = queueGroupRequests(1);
        const { wrapper, userStore } = mountComponent();

        const loadA = wrapper.vm.getUserGroups('usr_a');
        // No newer Groups request runs, so only the user check rejects this
        userStore.userDialog.id = 'usr_b';
        requestA.resolve(groupsResponse('usr_a', ['Alpha']));
        await loadA;

        expect(handleGroupList).not.toHaveBeenCalled();
        expect(groupNames(userStore)).toEqual([]);
        expect(userStore.userDialog.isGroupsLoading).toBe(false);
    });

    test('clears loading and handles a rejected request without throwing', async () => {
        const [requestA] = queueGroupRequests(1);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { wrapper, userStore } = mountComponent();

        const loadA = wrapper.vm.getUserGroups('usr_a');
        expect(userStore.userDialog.isGroupsLoading).toBe(true);
        requestA.reject(new Error('network down'));

        await expect(loadA).resolves.toBeUndefined();
        expect(userStore.userDialog.isGroupsLoading).toBe(false);
        expect(consoleError).toHaveBeenCalledWith('getUserGroups', expect.any(Error));
        consoleError.mockRestore();
    });

    test('a rejected stale request leaves the newer request loading', async () => {
        const [requestA, requestB] = queueGroupRequests(2);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { wrapper, userStore } = mountComponent();

        const loadA = wrapper.vm.getUserGroups('usr_a');
        userStore.userDialog.id = 'usr_b';
        const loadB = wrapper.vm.getUserGroups('usr_b');

        requestA.reject(new Error('network down'));
        await loadA;
        expect(userStore.userDialog.isGroupsLoading).toBe(true);

        requestB.resolve(groupsResponse('usr_b', ['Beta']));
        await loadB;
        expect(userStore.userDialog.isGroupsLoading).toBe(false);
        expect(groupNames(userStore)).toEqual(['Beta']);
        console.error.mockRestore();
    });

    test('retries after a failure when the request runs again', async () => {
        const [failed, retry] = queueGroupRequests(2);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { wrapper, userStore } = mountComponent();

        const firstLoad = wrapper.vm.getUserGroups('usr_a');
        failed.reject(new Error('network down'));
        await firstLoad;

        const retryLoad = wrapper.vm.getUserGroups('usr_a');
        retry.resolve(groupsResponse('usr_a', ['Alpha']));
        await retryLoad;
        await flushPromises();

        expect(groupNames(userStore)).toEqual(['Alpha']);
        expect(userStore.userDialog.isGroupsLoading).toBe(false);
        console.error.mockRestore();
    });
});
