import { ref } from 'vue';

import { toolDefinitionMap, toolDefinitions } from '../shared/constants';

// Keys of tools whose availabilityMethod confirmed them. Shared so the Tools
// page and the nav agree; tools with a check stay hidden until it passes.
const availableToolKeys = ref(new Set());

/**
 * @param {object} tool
 * @returns {boolean}
 */
function isToolAvailable(tool) {
    return !tool?.availabilityMethod || availableToolKeys.value.has(tool.key);
}

/**
 * @param {string} navKey A tool nav key, `tool-<tool key>`
 * @returns {boolean}
 */
function isToolNavKeyAvailable(navKey) {
    const tool = toolDefinitionMap.get(navKey.slice('tool-'.length));
    return !tool || isToolAvailable(tool);
}

// The nav and the Tools page can refresh at the same time; only the latest
// refresh may write, so a slower older one cannot overwrite it
let latestRefresh = 0;

async function refreshToolAvailability() {
    const refresh = ++latestRefresh;
    const checks = toolDefinitions
        .filter((tool) => tool.availabilityMethod)
        .map(async (tool) => {
            try {
                return (await AppApi[tool.availabilityMethod]()) ? tool.key : null;
            } catch {
                return null;
            }
        });
    const keys = new Set((await Promise.all(checks)).filter(Boolean));
    if (refresh === latestRefresh) {
        availableToolKeys.value = keys;
    }
}

export function useToolAvailability() {
    return {
        availableToolKeys,
        isToolAvailable,
        isToolNavKeyAvailable,
        refreshToolAvailability
    };
}
