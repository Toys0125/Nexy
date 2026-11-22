import { i18n } from '../../plugins/i18n';

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function nexvrNotificationText(key, params = {}) {
    return i18n.global.t(`view.notification.nexvr.${key}`, params);
}
