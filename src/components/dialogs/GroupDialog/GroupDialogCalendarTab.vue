<template>
    <div class="flex flex-col gap-3">
        <div v-if="canCreateEvent" class="flex justify-end">
            <Button size="sm" variant="outline" @click="showCreateGroupEventDialog(groupDialog.ref)">
                <CalendarPlus />
                {{ t('dialog.group.actions.create_event') }}
            </Button>
        </div>

        <div class="rounded-xl bg-(--profile-card) p-3">
            <div
                class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 pb-2 border-b border-border">
                {{ t('dialog.group.info.upcoming_events') }}
            </div>
            <div v-if="upcomingCalenderEvents.length" class="flex flex-wrap gap-4 overflow-y-auto max-h-[360px] py-2.5">
                <GroupCalendarEventCard
                    v-for="value in upcomingCalenderEvents"
                    :key="value.id"
                    :event="value"
                    :is-following="value.userInterest?.isFollowing"
                    @update-following-calendar-data="updateFollowingCalendarData"
                    mode="grid"
                    card-class="group-dialog-grid-card" />
            </div>
            <span v-else class="text-xs text-muted-foreground">{{ t('dialog.group_calendar.no_events') }}</span>
        </div>

        <div v-if="pastCalenderEvents.length" class="rounded-xl bg-(--profile-card) p-3">
            <div
                class="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 pb-2 border-b border-border">
                {{ t('dialog.group.info.past_events') }}
            </div>
            <div class="flex flex-wrap gap-4 overflow-y-auto overflow-x-hidden max-h-[230px] py-2.5">
                <GroupCalendarEventCard
                    v-for="value in pastCalenderEvents"
                    :key="value.id"
                    :event="value"
                    :is-following="value.userInterest?.isFollowing"
                    @update-following-calendar-data="updateFollowingCalendarData"
                    mode="grid"
                    card-class="group-dialog-grid-card" />
            </div>
        </div>
    </div>
</template>

<script setup>
    import { CalendarPlus } from 'lucide-vue-next';
    import { computed } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { Button } from '@/components/ui/button';
    import { hasGroupPermission } from '../../../shared/utils';
    import { useGroupStore } from '../../../stores';
    import { useGroupCalendarEvents } from './useGroupCalendarEvents';

    import GroupCalendarEventCard from '../../../views/Tools/components/GroupCalendarEventCard.vue';

    const { t } = useI18n();

    const { groupDialog } = storeToRefs(useGroupStore());
    const { showCreateGroupEventDialog } = useGroupStore();

    const { pastCalenderEvents, upcomingCalenderEvents, updateFollowingCalendarData } =
        useGroupCalendarEvents(groupDialog);

    const canCreateEvent = computed(() => hasGroupPermission(groupDialog.value.ref, 'group-calendar-manage'));
</script>
