<script setup>
    import { computed, onUnmounted, ref, watch } from 'vue';
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
    const DETAIL_LOAD_TIMEOUT = 10000;
    let requestId = 0;
    let loadingTimer;
    const friends = computed(() =>
        [...friendStore.friends.entries()]
            .map(([id, friend]) => userStore.cachedUsers.get(id) || { ...friend, id })
            .filter((friend) =>
                sameInstanceLocation(friend.location || friend.$location?.tag, instanceDialog.value.location)
            )
    );

    /** Load details independently with one UI deadline, ignoring superseded or unmounted requests. */
    async function load(force = false) {
        const id = ++requestId;
        clearTimeout(loadingTimer);
        const location = instanceDialog.value.location;
        loading.value = true;
        error.value = false;
        try {
            const parsed = parseLocation(location);
            instance.value = getCachedInstance(location) || null;
            world.value = instance.value?.world?.id ? instance.value.world : null;
            loadingTimer = setTimeout(() => {
                if (id !== requestId) return;
                loading.value = false;
                error.value = true;
            }, DETAIL_LOAD_TIMEOUT);
            const results = await Promise.allSettled([
                Promise.resolve()
                    .then(() => fetchInstanceDetails(location, force))
                    .then((result) => {
                        if (id !== requestId) return;
                        instance.value = result;
                        uiStore.setDialogCrumbLabel(
                            'instance',
                            location,
                            instance.value?.displayName || `#${parsed.instanceName}`
                        );
                    }),
                Promise.resolve()
                    .then(() => worldRequest.getWorld({ worldId: parsed.worldId }))
                    .then((result) => {
                        if (id === requestId) world.value = result.ref;
                    })
            ]);
            if (id !== requestId) return;
            error.value = results.some((result) => result.status === 'rejected');
        } catch {
            if (id === requestId) error.value = true;
        } finally {
            if (id === requestId) {
                clearTimeout(loadingTimer);
                loading.value = false;
            }
        }
    }
    onUnmounted(() => {
        ++requestId;
        clearTimeout(loadingTimer);
    });
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
    /** Open the existing launch flow using the resolved location and optional short name. */
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
