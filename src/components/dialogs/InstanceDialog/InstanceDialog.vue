<script setup>
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { worldRequest } from '@/api';
    import { useFriendStore, useInstanceStore, useLaunchStore, useUiStore, useUserStore } from '@/stores';
    import { fetchInstanceDetails, getCachedInstance } from '@/coordinators/instanceCoordinator';
    import { showWorldDialog } from '@/coordinators/worldCoordinator';
    import { showUserDialog } from '@/coordinators/userCoordinator';
    import { getLaunchURL } from '@/shared/utils/instance';
    import { parseLocation } from '@/shared/utils/locationParser';
    import { sameInstanceLocation } from '@/shared/utils/instanceDetails';
    import { copyToClipboard } from '@/shared/utils/appActions';
    import InstanceDialogContent from './InstanceDialogContent.vue';

    const { instanceDialog, lastInstanceApplied } = storeToRefs(useInstanceStore());
    const uiStore = useUiStore();
    const launchStore = useLaunchStore();
    const friendStore = useFriendStore();
    const userStore = useUserStore();
    const instance = ref(null);
    const world = ref(null);
    const loading = ref(false);
    const error = ref(false);
    let requestId = 0;
    const friends = computed(() =>
        [...friendStore.friends.entries()]
            .map(([id, friend]) => userStore.cachedUsers.get(id) || { ...friend, id })
            .filter((friend) =>
                sameInstanceLocation(friend.location || friend.$location?.tag, instanceDialog.value.location)
            )
    );

    /** Load instance and world details, ignoring results superseded by a newer selection or refresh. */
    async function load(force = false) {
        const id = ++requestId;
        const location = instanceDialog.value.location;
        const parsed = parseLocation(location);
        instance.value = getCachedInstance(location) || null;
        world.value = instance.value?.world?.id ? instance.value.world : null;
        loading.value = true;
        error.value = false;
        try {
            const [instanceResult, worldResult] = await Promise.allSettled([
                fetchInstanceDetails(location, force),
                worldRequest.getWorld({ worldId: parsed.worldId })
            ]);
            if (id !== requestId) return;
            if (instanceResult.status === 'fulfilled') {
                instance.value = instanceResult.value;
                uiStore.setDialogCrumbLabel(
                    'instance',
                    location,
                    instance.value?.displayName || `#${parsed.instanceName}`
                );
            } else {
                error.value = true;
            }
            if (worldResult.status === 'fulfilled') world.value = worldResult.value.ref;
        } finally {
            if (id === requestId) loading.value = false;
        }
    }
    watch(
        () => instanceDialog.value.location,
        () => load(),
        { immediate: true }
    );
    watch(lastInstanceApplied, (location) => {
        if (sameInstanceLocation(location, instanceDialog.value.location)) {
            instance.value = getCachedInstance(location) || instance.value;
        }
    });
    function join() {
        launchStore.showLaunchDialog(
            instance.value?.location || instanceDialog.value.location,
            instanceDialog.value.shortName
        );
    }
</script>

<template>
    <InstanceDialogContent
        :location="instanceDialog.location"
        :instance="instance"
        :world="world"
        :friends="friends"
        :loading="loading"
        :error="error"
        @refresh="load(true)"
        @close="uiStore.closeMainDialog()"
        @join="join"
        @world="showWorldDialog(instanceDialog.location, instanceDialog.shortName)"
        @owner="showUserDialog"
        @user="showUserDialog"
        @copy="copyToClipboard(getLaunchURL(parseLocation(instanceDialog.location)))" />
</template>
