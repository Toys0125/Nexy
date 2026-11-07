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

async function refreshToolAvailability() {
    const checks = toolDefinitions
        .filter((tool) => tool.availabilityMethod)
        .map(async (tool) => {
            try {
                return (await AppApi[tool.availabilityMethod]()) ? tool.key : null;
            } catch {
                return null;
            }
        });
    availableToolKeys.value = new Set((await Promise.all(checks)).filter(Boolean));
}

export function useToolAvailability() {
    return {
        availableToolKeys,
        isToolAvailable,
        isToolNavKeyAvailable,
        refreshToolAvailability
    };
}
