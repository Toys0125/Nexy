import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { mount } from '@vue/test-utils';

const { mockDownloadAndSaveJson } = vi.hoisted(() => ({
    mockDownloadAndSaveJson: vi.fn()
}));
vi.mock('../../../shared/utils', () => ({ downloadAndSaveJson: mockDownloadAndSaveJson }));
vi.mock('../../../stores', async () => {
    const { defineStore } = await import('pinia');
    return {
        useAppearanceSettingsStore: defineStore('AppearanceSettings', { state: () => ({ isDarkMode: false }) })
    };
});

vi.mock('vue-json-pretty', () => ({
    default: {
        name: 'VueJsonPretty',
        template: '<div class="vjp-stub" />',
        props: ['data', 'deep', 'theme', 'showIcon']
    }
}));

import DialogJsonTab from '../DialogJsonTab.vue';

import en from '../../../localization/en.json';

import { createI18n } from 'vue-i18n';

const i18n = createI18n({
    locale: 'en',
    fallbackLocale: 'en',
    legacy: false,
    globalInjection: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en }
});

/**
 * @param props
 * @param storeOverrides
 */
function mountComponent(props = {}, storeOverrides = {}) {
    const pinia = createTestingPinia({
        stubActions: false,
        initialState: {
            AppearanceSettings: {
                isDarkMode: false,
                ...storeOverrides
            }
        }
    });

    return mount(DialogJsonTab, {
        props: {
            dialogId: 'usr_test123',
            dialogRef: { id: 'usr_test123', displayName: 'Test' },
            treeData: { id: 'usr_test123', name: 'TestData' },
            treeDataKey: 'usr_test123',
            ...props
        },
        global: {
            plugins: [i18n, pinia],
            stubs: {
                RefreshCw: { template: '<svg class="refresh-icon" />' },
                Download: { template: '<svg class="download-icon" />' }
            }
        }
    });
}

describe('DialogJsonTab.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        test('renders refresh and download buttons', () => {
            const wrapper = mountComponent();
            const buttons = wrapper.findAll('button');
            expect(buttons).toHaveLength(2);
        });

        test('renders vue-json-pretty with treeData', () => {
            const wrapper = mountComponent();
            const jsonPretty = wrapper.findComponent({ name: 'VueJsonPretty' });
            expect(jsonPretty.exists()).toBe(true);
            expect(jsonPretty.props('data')).toEqual({
                id: 'usr_test123',
                name: 'TestData'
            });
            expect(jsonPretty.props('deep')).toBe(2);
        });

        test('uses light theme by default', () => {
            const wrapper = mountComponent();
            const jsonPretty = wrapper.findComponent({ name: 'VueJsonPretty' });
            expect(jsonPretty.props('theme')).toBe('light');
        });

        test('uses dark theme when isDarkMode is true', () => {
            const wrapper = mountComponent({}, { isDarkMode: true });
            const jsonPretty = wrapper.findComponent({ name: 'VueJsonPretty' });
            expect(jsonPretty.props('theme')).toBe('dark');
        });
    });

    describe('fileAnalysis', () => {
        test('does not render extra json-pretty when fileAnalysis is null', () => {
            const wrapper = mountComponent({ fileAnalysis: null });
            const jsonComponents = wrapper.findAllComponents({
                name: 'VueJsonPretty'
            });
            expect(jsonComponents).toHaveLength(1);
        });

        test('does not render extra json-pretty when fileAnalysis is empty object', () => {
            const wrapper = mountComponent({ fileAnalysis: {} });
            const jsonComponents = wrapper.findAllComponents({
                name: 'VueJsonPretty'
            });
            expect(jsonComponents).toHaveLength(1);
        });

        test('renders extra json-pretty when fileAnalysis has data', () => {
            const wrapper = mountComponent({
                fileAnalysis: { size: 1024, format: 'vrca' }
            });
            const jsonComponents = wrapper.findAllComponents({
                name: 'VueJsonPretty'
            });
            expect(jsonComponents).toHaveLength(2);
            expect(jsonComponents[1].props('data')).toEqual({
                size: 1024,
                format: 'vrca'
            });
        });
    });

    describe('interactions', () => {
        test('emits refresh when refresh button is clicked', async () => {
            const wrapper = mountComponent();
            const buttons = wrapper.findAll('button');
            // First button is refresh
            await buttons[0].trigger('click');
            expect(wrapper.emitted('refresh')).toHaveLength(1);
        });

        test('calls downloadAndSaveJson with dialogId and dialogRef when download button is clicked', async () => {
            const dialogRef = { id: 'usr_test123', displayName: 'Test' };
            const wrapper = mountComponent({
                dialogId: 'usr_test123',
                dialogRef
            });
            const buttons = wrapper.findAll('button');
            // Second button is download
            await buttons[1].trigger('click');
            expect(mockDownloadAndSaveJson).toHaveBeenCalledWith('usr_test123', dialogRef);
        });

        test('disables download while the response is unavailable', async () => {
            const wrapper = mountComponent({ dialogRef: null });
            const download = wrapper.findAll('button')[1];
            expect(download.attributes('disabled')).toBeDefined();
            await download.trigger('click');
            expect(mockDownloadAndSaveJson).not.toHaveBeenCalled();
        });
    });
});
