import { defineStore } from 'pinia';
import { ref } from 'vue';

import configRepository from '../services/config';

const NEW_ISSUE_URL = 'https://github.com/valzzu/Nexy/issues/new';
const MAX_ISSUE_URL_LENGTH = 7500;

// Network/disk noise that isn't actionable as a bug report.
// Status codes come from the `status` $throw sets on API errors, so numbers in
// other messages ("array length 500", "exit code 500") aren't mistaken for them.
// 501 is NexVR answering for endpoints it doesn't implement, nothing to fix client-side.
const IGNORED_STATUS_CODES = new Set([401, 403, 404, 500, 501, 503]);
const IGNORED_MESSAGES = [
    'No such host is known',
    'The SSL connection could not be established',
    'A connection attempt failed',
    'no data of the requested type was found',
    'An error occurred while sending the request',
    'database or disk is full',
    'disk I/O error',
    'There is not enough space on the disk.',
    'The requested address is not valid in its context.',
    'ResizeObserver loop'
];

/**
 * @param {unknown} error
 * @returns {{ message: string; stack: string }}
 */
function normalizeError(error) {
    if (error instanceof Error) {
        const stack = typeof error.stack === 'string' ? error.stack : '';
        const message = `${error.name}: ${error.message}`;
        // V8 stacks start with "Name: message", don't repeat it
        return { message, stack: stack.startsWith(message) ? stack.slice(message.length).replace(/^\n/, '') : stack };
    }
    if (typeof error === 'string') {
        return { message: error, stack: '' };
    }
    try {
        // undefined (e.g. Promise.reject() with no reason) doesn't serialize
        const json = JSON.stringify(error);
        return { message: typeof json === 'string' ? json : String(error), stack: '' };
    } catch {
        return { message: String(error), stack: '' };
    }
}

/**
 * Install paths contain the OS username, keep it out of public issues.
 *
 * @param {string} text
 * @returns {string}
 */
function scrubUserPaths(text) {
    // Usernames can contain spaces, so redact up to the next separator
    return text.replace(/([\\/](?:Users|home)[\\/])[^\\/\n]+/gi, '$1<user>');
}

export const useErrorReportStore = defineStore('ErrorReport', () => {
    const errorReportPopup = ref(true);
    const errorReportDialog = ref({
        visible: false,
        source: '',
        message: '',
        stack: '',
        time: '',
        extraCount: 0
    });

    /** Errors the user already dismissed this session */
    const dismissedSignatures = new Set();

    let configReady = false;
    const configLoaded = configRepository
        .getBool('Nexy_errorReportPopup', true)
        .then((value) => {
            errorReportPopup.value = value;
        })
        .catch((e) => {
            console.error('Failed to load error report popup setting:', e);
        })
        .finally(() => {
            configReady = true;
        });

    /**
     * @param {unknown} error
     * @param {string} source
     */
    function reportError(error, source) {
        if (!configReady) {
            // Startup errors wait for the saved setting so a disabled popup stays disabled
            configLoaded.then(() => reportError(error, source));
            return;
        }
        if (!errorReportPopup.value) return;

        const normalized = normalizeError(error);
        const message = scrubUserPaths(normalized.message);
        const stack = scrubUserPaths(normalized.stack);
        const status = typeof error === 'object' && error !== null ? error.status : undefined;
        if (
            !message ||
            IGNORED_STATUS_CODES.has(status) ||
            IGNORED_MESSAGES.some((ignored) => message.includes(ignored))
        ) {
            return;
        }

        const signature = `${message}\n${stack.split('\n', 1)[0]}`;
        if (dismissedSignatures.has(signature)) return;

        const D = errorReportDialog.value;
        if (D.visible) {
            // Keep the first error on screen, later ones are usually fallout from it
            D.extraCount++;
            return;
        }
        errorReportDialog.value = {
            visible: true,
            source,
            message,
            stack,
            time: new Date().toISOString(),
            extraCount: 0
        };
    }

    function dismissErrorReport() {
        const D = errorReportDialog.value;
        dismissedSignatures.add(`${D.message}\n${D.stack.split('\n', 1)[0]}`);
        D.visible = false;
    }

    /**
     * @returns {string}
     */
    function getErrorReportDetails() {
        const D = errorReportDialog.value;
        return [
            D.message,
            D.stack,
            '',
            `Source: ${D.source}`,
            `Version: ${VERSION}${NIGHTLY ? ' (Nightly)' : ''}`,
            `Platform: ${navigator.userAgent}`,
            `Time: ${D.time}`
        ].join('\n');
    }

    /**
     * Prefilled GitHub issue, stack then message trimmed so the URL stays openable.
     *
     * @returns {string}
     */
    function getErrorReportIssueUrl() {
        const D = errorReportDialog.value;
        const firstLine = D.message.split('\n', 1)[0];
        const title = `[Bug] ${firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine}`;

        const buildUrl = (message, stack) => {
            const body = [
                '**Describe the bug**',
                'What were you doing when this happened?',
                '',
                '**Error**',
                '```',
                message,
                stack,
                '```',
                '',
                `**Source:** ${D.source}`,
                `**Version:** ${VERSION}${NIGHTLY ? ' (Nightly)' : ''}`,
                `**Platform:** ${navigator.userAgent}`
            ].join('\n');
            const params = new URLSearchParams({ title, body, labels: 'bug' });
            return `${NEW_ISSUE_URL}?${params}`;
        };

        let stackLines = D.stack.split('\n');
        let stack = D.stack;
        let url = buildUrl(D.message, stack);
        while (url.length > MAX_ISSUE_URL_LENGTH && stackLines.length > 0) {
            stackLines = stackLines.slice(0, -1);
            stack = [...stackLines, '    ...'].join('\n');
            url = buildUrl(D.message, stack);
        }
        if (url.length <= MAX_ISSUE_URL_LENGTH) return url;

        // Still too long, binary search the longest message prefix that fits
        let low = 0;
        let high = D.message.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (buildUrl(`${D.message.slice(0, mid)}...`, stack).length <= MAX_ISSUE_URL_LENGTH) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return buildUrl(`${D.message.slice(0, low)}...`, stack);
    }

    async function setErrorReportPopup() {
        await configLoaded;
        errorReportPopup.value = !errorReportPopup.value;
        await configRepository.setBool('Nexy_errorReportPopup', errorReportPopup.value);
    }

    return {
        errorReportPopup,
        errorReportDialog,
        reportError,
        dismissErrorReport,
        getErrorReportDetails,
        getErrorReportIssueUrl,
        setErrorReportPopup
    };
});
