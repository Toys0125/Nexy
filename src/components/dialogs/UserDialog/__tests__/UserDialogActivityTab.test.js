import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
vi.mock('echarts', () => ({
    init: vi.fn(() => ({
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
    }))
}));

import UserDialogActivityTab from '../UserDialogActivityTab.vue';
import { useActivityStore, useUserStore } from '../../../../stores';
import configRepository from '../../../../services/config';

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

function activityView(filteredEventCount) {
    return {
        filteredEventCount,
        peakDay: `day-${filteredEventCount}`,
        peakTime: `time-${filteredEventCount}`,
        rawBuckets: [],
        normalizedBuckets: []
    };
}

const EMPTY_OVERLAP_VIEW = {
    rawBuckets: [],
    normalizedBuckets: [],
    hasOverlapData: false,
    overlapPercent: 0,
    bestOverlapTime: ''
};

/**
 * Each call to the given store action returns the next pending request, so a
 * test settles them in whatever order it wants to exercise
 */
function queueRequests(action, count) {
    const requests = Array.from({ length: count }, deferred);
    let index = 0;
    action.mockImplementation(() => requests[index++].promise);
    return requests;
}

function mountComponent({ dialogUserId = 'usr_a' } = {}) {
    const pinia = createTestingPinia({ stubActions: false });
    const userStore = useUserStore(pinia);
    userStore.$patch({
        userDialog: {
            id: dialogUserId,
            ref: { id: dialogUserId },
            visible: true,
            activeTab: 'Activity',
            activityPeriodDays: 30
        },
        currentUser: { id: 'usr_me', homeLocation: '' }
    });

    const activityStore = useActivityStore(pinia);
    activityStore.loadActivityView = vi.fn().mockResolvedValue(activityView(0));
    activityStore.loadOverlapView = vi.fn().mockResolvedValue(EMPTY_OVERLAP_VIEW);
    activityStore.loadTopWorldsView = vi.fn().mockResolvedValue([]);
    activityStore.getCache = vi.fn().mockResolvedValue({ sessions: [] });

    const wrapper = mount(UserDialogActivityTab, {
        global: {
            plugins: [pinia],
            stubs: { DailyPlaytime: true }
        }
    });
    return { wrapper, userStore, activityStore };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('UserDialogActivityTab.vue loadOnlineFrequency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            }
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('ignores an older user’s activity that returns after the newer user loaded', async () => {
        const { wrapper, userStore, activityStore } = mountComponent();
        const [requestA, requestB] = queueRequests(activityStore.loadActivityView, 2);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        userStore.userDialog.id = 'usr_b';
        void wrapper.vm.loadOnlineFrequency('usr_b');
        await flushPromises();

        requestB.resolve(activityView(2));
        await flushPromises();
        requestA.resolve(activityView(1));
        await flushPromises();

        expect(wrapper.vm.filteredEventCount).toBe(2);
        expect(wrapper.vm.peakDayText).toBe('day-2');
        expect(wrapper.vm.isLoading).toBe(false);
    });

    test('a stale request settling first leaves the newer request loading', async () => {
        const { wrapper, userStore, activityStore } = mountComponent();
        const [requestA, requestB] = queueRequests(activityStore.loadActivityView, 2);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        userStore.userDialog.id = 'usr_b';
        void wrapper.vm.loadOnlineFrequency('usr_b');
        await flushPromises();

        requestA.resolve(activityView(1));
        await flushPromises();
        expect(wrapper.vm.isLoading).toBe(true);
        expect(wrapper.vm.filteredEventCount).toBe(0);

        requestB.resolve(activityView(2));
        await flushPromises();
        expect(wrapper.vm.isLoading).toBe(false);
        expect(wrapper.vm.filteredEventCount).toBe(2);
    });

    test('keeps only the latest response when switching A → B → A', async () => {
        const { wrapper, userStore, activityStore } = mountComponent();
        const [firstA, requestB, secondA] = queueRequests(activityStore.loadActivityView, 3);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        userStore.userDialog.id = 'usr_b';
        void wrapper.vm.loadOnlineFrequency('usr_b');
        await flushPromises();
        userStore.userDialog.id = 'usr_a';
        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        expect(activityStore.loadActivityView).toHaveBeenCalledTimes(3);

        secondA.resolve(activityView(3));
        await flushPromises();
        // The first A response passes the user check now the dialog is back on
        // A, so only the request id can reject it
        firstA.resolve(activityView(1));
        requestB.resolve(activityView(2));
        await flushPromises();

        expect(wrapper.vm.filteredEventCount).toBe(3);
        expect(wrapper.vm.isLoading).toBe(false);
    });

    test('a response for the previous visit is dropped while the next load reads settings', async () => {
        const { wrapper, userStore, activityStore } = mountComponent();
        const [firstVisit] = queueRequests(activityStore.loadActivityView, 2);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        // The dialog shows B on another tab and returns to A; the new load is
        // still reading settings when the first visit's response arrives
        userStore.userDialog.id = 'usr_b';
        await flushPromises();
        userStore.userDialog.id = 'usr_a';
        const settings = deferred();
        configRepository.getString.mockImplementationOnce(() => settings.promise);
        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();

        firstVisit.resolve(activityView(1));
        await flushPromises();

        expect(wrapper.vm.filteredEventCount).toBe(0);
        settings.resolve('count');
        await flushPromises();
        expect(activityStore.loadActivityView).toHaveBeenCalledTimes(2);
    });

    test('a stale self request does not start another top-worlds load', async () => {
        const { wrapper, activityStore } = mountComponent({ dialogUserId: 'usr_me' });
        const [olderCache, newerCache] = queueRequests(activityStore.getCache, 2);

        void wrapper.vm.loadOnlineFrequency('usr_me');
        await flushPromises();
        void wrapper.vm.refreshData();
        await flushPromises();
        expect(activityStore.getCache).toHaveBeenCalledTimes(2);

        newerCache.resolve({ sessions: [] });
        await flushPromises();
        olderCache.resolve({ sessions: [] });
        await flushPromises();

        expect(activityStore.loadTopWorldsView).toHaveBeenCalledTimes(1);
        expect(wrapper.vm.topWorldsLoading).toBe(false);
    });

    test('a settings load pending at unmount does not refresh', async () => {
        const { wrapper, activityStore } = mountComponent();
        const settings = deferred();
        configRepository.getString.mockImplementationOnce(() => settings.promise);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        wrapper.unmount();
        settings.resolve('count');
        await flushPromises();

        expect(activityStore.loadActivityView).not.toHaveBeenCalled();
    });

    test('clears loading after a rejected request and loads again on retry', async () => {
        const { wrapper, activityStore } = mountComponent();
        const [failed, retry] = queueRequests(activityStore.loadActivityView, 2);

        const firstLoad = wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        expect(wrapper.vm.isLoading).toBe(true);
        failed.reject(new Error('database busy'));
        await expect(firstLoad).rejects.toThrow('database busy');
        expect(wrapper.vm.isLoading).toBe(false);

        void wrapper.vm.loadOnlineFrequency('usr_a');
        await flushPromises();
        retry.resolve(activityView(4));
        await flushPromises();

        expect(wrapper.vm.filteredEventCount).toBe(4);
        expect(wrapper.vm.isLoading).toBe(false);
    });
});
