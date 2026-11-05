import { useErrorReportStore } from '../stores/errorReport';

/**
 * Surfaces uncaught errors in a popup with a "Report on GitHub" button.
 *
 * @param {import('vue').App} app
 */
export function initErrorReporting(app) {
    const report = (error, source) => {
        try {
            useErrorReportStore().reportError(error, source);
        } catch (e) {
            console.error('Failed to show error report:', e);
        }
    };

    app.config.errorHandler = (error, _instance, info) => {
        // A custom handler replaces Vue's own console logging
        console.error(error);
        report(error, `vue: ${info}`);
    };
    window.addEventListener('error', (event) => {
        report(event.error ?? event.message, 'window.onerror');
    });
    window.addEventListener('unhandledrejection', (event) => {
        report(event.reason, 'unhandledrejection');
    });
}
