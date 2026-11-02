<template>
    <div class="flex min-w-0 max-w-full flex-col items-start gap-1">
        <div
            :class="
                cn(
                    'flex min-w-0 items-center gap-2 overflow-hidden text-muted-foreground rounded-full border border-muted-foreground/10 py-0.5 px-2',
                    props.class
                )
            ">
            <span v-if="region" :class="cn('flags inline-block shrink-0', region)"></span>
            <span
                @click="openInstance"
                @keydown.enter.prevent="openInstance"
                @keydown.space.prevent="openInstance"
                role="button"
                tabindex="0"
                class="min-w-0 flex-1 cursor-pointer truncate text-muted-foreground"
                :title="t('dialog.instance.open_details')">
                <Unlock v-if="isUnlocked" :class="['inline-block', 'mr-1.25']" />
                <span>{{ accessTypeName }} ⋅ #{{ instanceName }}</span>
            </span>
            <span
                v-if="groupName"
                @click="openLocationGroupDialog"
                class="min-w-0 shrink cursor-pointer truncate"
                :title="groupName"
                >({{ groupName }})</span
            >
            <div v-if="closedAt">
                <TooltipWrapper side="top">
                    <template #content>
                        {{ t('dialog.user.info.instance_closed_at') }}:
                        {{ formatDateFilter(closedAt, 'long') }}
                    </template>
                    <AlertTriangle class="text-orange-500 my-auto" />
                </TooltipWrapper>
            </div>
            <Lock v-if="strict" class="text-muted-foreground" />
        </div>
        <div class="flex max-w-full items-center gap-2 text-xs text-muted-foreground">
            <InstanceContentBadge :instance="instanceInfo" />
            <span class="shrink-0">{{ t('dialog.instance.owner') }}:</span>
            <button
                v-if="ownerId"
                type="button"
                class="min-w-0 truncate text-primary hover:underline"
                :title="ownerName || ownerId"
                @click.stop="showUserDialog(ownerId)">
                {{ ownerName || ownerId }}
            </button>
            <span v-else>{{ t('dialog.instance.unknown') }}</span>
        </div>
    </div>
</template>

<script setup>
    import { AlertTriangle, Lock, Unlock } from 'lucide-vue-next';
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { useInstanceStore } from '../stores';
    import { fetchInstanceDetails, getCachedInstance, showInstanceDialog } from '../coordinators/instanceCoordinator';
    import { showUserDialog } from '../coordinators/userCoordinator';
    import { getInstanceAccessKey, sameInstanceLocation } from '../shared/utils/instanceDetails';
    import InstanceContentBadge from './InstanceContentBadge.vue';
    import { showGroupDialog } from '../coordinators/groupCoordinator';
    import { formatDateFilter, getGroupName, parseLocation } from '../shared/utils';
    import { accessTypeLocaleKeyMap } from '../shared/constants';
    import { cn } from '@/lib/utils';

    const { t } = useI18n();
    const { lastInstanceApplied } = storeToRefs(useInstanceStore());

    const instanceInfo = ref(null);
    const ownerId = computed(
        () =>
            instanceInfo.value?.creatorId ||
            (instanceInfo.value?.type !== 'group' ? instanceInfo.value?.ownerId : '') ||
            props.locationobject?.userId ||
            ''
    );
    const ownerName = computed(
        () => instanceInfo.value?.$nexvr?.creatorName || props.locationobject?.user?.displayName || ''
    );

    const props = defineProps({
        locationobject: Object,
        currentuserid: String,
        worlddialogshortname: String,
        grouphint: {
            type: String,
            default: ''
        },
        class: { type: null, required: false }
    });

    const location = ref('');
    const instanceName = ref('');
    const accessTypeName = ref('');
    const region = ref('us');
    const shortName = ref('');
    const isUnlocked = ref(false);
    const strict = ref(false);
    const groupName = ref('');
    const closedAt = ref('');

    function parse() {
        const locObj = props.locationobject;
        if (!locObj) return;
        location.value = locObj.tag;
        accessTypeName.value = translateAccessType(locObj.accessTypeName);
        strict.value = locObj.strict;
        shortName.value = locObj.shortName;

        isUnlocked.value =
            (props.worlddialogshortname && locObj.shortName && props.worlddialogshortname === locObj.shortName) ||
            props.currentuserid === locObj.userId;

        region.value = locObj.region || 'us';

        instanceName.value = locObj.instanceName;
        closedAt.value = '';
        instanceInfo.value = null;

        const L = parseLocation(locObj.tag);
        if (!L.isRealInstance) {
            return;
        }

        const instanceRef = getCachedInstance(L.tag);
        instanceInfo.value = instanceRef || null;
        if (typeof instanceRef !== 'undefined') {
            const instanceLocation = parseLocation(instanceRef.location || instanceRef.id);
            const accessKey = getInstanceAccessKey(instanceRef);
            accessTypeName.value = accessKey
                ? t(accessKey)
                : translateAccessType(instanceLocation.accessTypeName || locObj.accessTypeName);
            if (instanceRef.displayName) {
                instanceName.value = instanceRef.displayName;
            }
            if (instanceRef.closedAt) {
                closedAt.value = instanceRef.closedAt;
            }
        }

        const groupId = parseLocation(instanceRef?.location || locObj.tag).groupId || locObj.groupId;
        if (props.grouphint) {
            groupName.value = props.grouphint;
        } else if (groupId) {
            groupName.value = groupId;
            getGroupName(groupId).then((name) => {
                if (name && props.locationobject.tag === locObj.tag) {
                    groupName.value = name;
                }
            });
        } else {
            groupName.value = '';
        }
    }

    /**
     * @param accessTypeNameRaw
     */
    function translateAccessType(accessTypeNameRaw) {
        const key = accessTypeLocaleKeyMap[accessTypeNameRaw];
        if (!key) {
            return accessTypeNameRaw;
        }
        if (accessTypeNameRaw === 'groupPublic' || accessTypeNameRaw === 'groupPlus') {
            const groupKey = accessTypeLocaleKeyMap['group'];
            return t(groupKey) + ' ' + t(key);
        }
        return t(key);
    }

    watch(() => props.locationobject, parse, { immediate: true });

    watch(
        () => props.locationobject?.tag,
        async (tag) => {
            if (!tag) return;
            try {
                await fetchInstanceDetails(tag);
                if (props.locationobject?.tag === tag) parse();
            } catch {
                // Presence can expose a location the API no longer permits us to inspect.
            }
        },
        { immediate: true }
    );

    watch(
        () => lastInstanceApplied.value,
        (instanceId) => {
            if (sameInstanceLocation(instanceId, location.value)) {
                parse();
            }
        },
        { immediate: true }
    );

    function openInstance() {
        showInstanceDialog(location.value, shortName.value);
    }

    function openLocationGroupDialog() {
        if (!location.value) return;
        const L = parseLocation(instanceInfo.value?.location || location.value);
        if (!L.groupId) return;
        showGroupDialog(L.groupId);
    }
</script>
