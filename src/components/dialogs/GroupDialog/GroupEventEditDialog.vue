<template>
    <Dialog :open="groupEventEditDialog.visible" @update:open="handleOpenChange">
        <DialogContent class="x-dialog sm:max-w-180 max-h-[85vh] overflow-hidden p-0 gap-0 flex flex-col">
            <DialogHeader class="px-6 pt-6 pb-4">
                <DialogTitle>
                    {{
                        isEditMode
                            ? t('dialog.group_event_edit.edit_header')
                            : t('dialog.group_event_edit.create_header')
                    }}
                </DialogTitle>
            </DialogHeader>

            <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-2">
                <FieldGroup class="gap-4">
                    <Field>
                        <FieldLabel>{{ t('dialog.group_event_edit.title') }}</FieldLabel>
                        <FieldContent>
                            <InputGroupField
                                v-model="groupEventEditDialog.title"
                                size="sm"
                                :maxlength="64"
                                :disabled="groupEventEditDialog.loading"
                                show-count />
                        </FieldContent>
                    </Field>

                    <Field>
                        <FieldLabel>{{ t('dialog.group_event_edit.description') }}</FieldLabel>
                        <FieldContent>
                            <InputGroupTextareaField
                                v-model="groupEventEditDialog.description"
                                :rows="4"
                                :maxlength="1024"
                                :disabled="groupEventEditDialog.loading"
                                show-count />
                        </FieldContent>
                    </Field>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field>
                            <FieldLabel>{{ t('dialog.group_event_edit.starts_at') }}</FieldLabel>
                            <FieldContent>
                                <InputGroupField
                                    v-model="startsAtLocal"
                                    type="datetime-local"
                                    size="sm"
                                    :disabled="groupEventEditDialog.loading" />
                                <p v-if="hasPastStartDate" class="mt-1 text-xs text-destructive">
                                    {{ t('dialog.group_event_edit.start_in_past') }}
                                </p>
                            </FieldContent>
                        </Field>
                        <Field>
                            <FieldLabel>{{ t('dialog.group_event_edit.ends_at') }}</FieldLabel>
                            <FieldContent>
                                <InputGroupField
                                    v-model="endsAtLocal"
                                    type="datetime-local"
                                    size="sm"
                                    :disabled="groupEventEditDialog.loading" />
                                <p v-if="hasInvalidDateRange" class="mt-1 text-xs text-destructive">
                                    {{ t('dialog.group_event_edit.invalid_date_range') }}
                                </p>
                            </FieldContent>
                        </Field>
                    </div>

                    <Field>
                        <FieldLabel>{{ t('dialog.group_event_edit.access_type') }}</FieldLabel>
                        <FieldContent>
                            <Select
                                v-model="groupEventEditDialog.accessType"
                                :disabled="
                                    groupEventEditDialog.loading || groupEventEditDialog.groupRef.privacy === 'private'
                                ">
                                <SelectTrigger size="sm" class="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="group">
                                        {{ t('dialog.group_event_edit.access_group') }}
                                    </SelectItem>
                                    <SelectItem value="public">
                                        {{ t('dialog.group_event_edit.access_public') }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </FieldContent>
                    </Field>
                </FieldGroup>
            </div>

            <DialogFooter class="px-6 py-4">
                <div v-if="isEditMode" class="mr-auto flex gap-2">
                    <Button variant="destructive" :disabled="groupEventEditDialog.loading" @click="deleteEvent">
                        <Trash2 />
                        {{ t('common.actions.delete') }}
                    </Button>
                </div>
                <Button variant="secondary" :disabled="groupEventEditDialog.loading" @click="closeDialog">
                    {{ t('common.actions.cancel') }}
                </Button>
                <Button :disabled="!canSubmit" @click="saveEvent">
                    {{
                        groupEventEditDialog.loading
                            ? t('dialog.group_event_edit.saving')
                            : isEditMode
                              ? t('dialog.group_event_edit.save')
                              : t('dialog.group_event_edit.create')
                    }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { storeToRefs } from 'pinia';
    import { Trash2 } from 'lucide-vue-next';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { Button } from '@/components/ui/button';
    import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
    import { InputGroupField, InputGroupTextareaField } from '@/components/ui/input-group';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

    import { groupRequest } from '../../../api';
    import { useGroupStore, useModalStore } from '../../../stores';

    // NexVR events have a title, description, start, end and visibility. VRChat's category,
    // tags, languages, platforms, roles, image, repeat and early-join settings have no
    // NexVR counterpart, so the editor doesn't offer them.

    const { t } = useI18n();
    const groupStore = useGroupStore();
    const { groupEventEditDialog } = storeToRefs(groupStore);
    const modalStore = useModalStore();

    const isEditMode = computed(() => groupEventEditDialog.value.mode === 'edit');
    // the dialog state is replaced each time it opens; remember the visibility it opened with
    const initialAccessType = ref('');
    watch(
        () => groupEventEditDialog.value,
        (dialog) => {
            initialAccessType.value = dialog.accessType;
        },
        { immediate: true }
    );
    const startsAtLocal = computed({
        get: () => toLocalDateTime(groupEventEditDialog.value.startsAt),
        set: (value) => {
            groupEventEditDialog.value.startsAt = toIsoDateTime(value);
        }
    });
    const endsAtLocal = computed({
        get: () => toLocalDateTime(groupEventEditDialog.value.endsAt),
        set: (value) => {
            groupEventEditDialog.value.endsAt = toIsoDateTime(value);
        }
    });
    const hasInvalidDateRange = computed(() => {
        const startsAt = Date.parse(groupEventEditDialog.value.startsAt);
        const endsAt = Date.parse(groupEventEditDialog.value.endsAt);
        return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt <= startsAt;
    });
    const hasPastStartDate = computed(() => {
        const startsAt = Date.parse(groupEventEditDialog.value.startsAt);
        return !isEditMode.value && Number.isFinite(startsAt) && startsAt <= Date.now();
    });
    const canSubmit = computed(() => {
        const D = groupEventEditDialog.value;
        return (
            !D.loading &&
            D.title.trim().length >= 1 &&
            D.description.trim().length >= 1 &&
            Number.isFinite(Date.parse(D.startsAt)) &&
            Number.isFinite(Date.parse(D.endsAt)) &&
            !hasInvalidDateRange.value &&
            !hasPastStartDate.value
        );
    });

    function toLocalDateTime(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) {
            return '';
        }
        const offset = date.getTimezoneOffset() * 60_000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    function toIsoDateTime(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : '';
    }

    function closeDialog() {
        if (!groupEventEditDialog.value.loading) {
            groupEventEditDialog.value.visible = false;
        }
    }

    function handleOpenChange(open) {
        if (!open) {
            closeDialog();
        }
    }

    async function saveEvent() {
        if (!canSubmit.value) {
            return;
        }
        const D = groupEventEditDialog.value;
        D.loading = true;
        const params = {
            startsAt: D.startsAt,
            endsAt: D.endsAt,
            title: D.title.trim(),
            description: D.description.trim(),
            groupId: D.groupId
        };
        // an edit only sends visibility when it was changed, so saving a title can't
        // overwrite a visibility someone else set meanwhile (e.g. admins-only)
        if (!isEditMode.value || D.accessType !== initialAccessType.value) {
            params.accessType = /** @type {import('vrchat').CalendarEventAccess} */ (D.accessType);
        }
        try {
            if (isEditMode.value) {
                await groupRequest.editGroupEvent({ ...params, eventId: D.eventId });
            } else {
                await groupRequest.createGroupEvent(params);
            }
            D.visible = false;
            groupStore.markGroupEventMutation();
            toast.success(
                t(isEditMode.value ? 'dialog.group_event_edit.edit_success' : 'dialog.group_event_edit.create_success')
            );
        } catch (error) {
            console.error('Failed to save group event:', error);
            toast.error(t('dialog.group_event_edit.save_error'));
        } finally {
            D.loading = false;
        }
    }
    async function deleteEvent() {
        if (!isEditMode.value || groupEventEditDialog.value.loading) {
            return;
        }
        const { ok } = await modalStore.confirm({
            title: t('confirm.title'),
            description: t('dialog.group_event_edit.delete_confirm'),
            destructive: true
        });
        if (!ok) {
            return;
        }

        const D = groupEventEditDialog.value;
        D.loading = true;
        try {
            await groupRequest.deleteGroupEvent({
                groupId: D.groupId,
                eventId: D.eventId
            });
            D.visible = false;
            groupStore.markGroupEventMutation();
            toast.success(t('dialog.group_event_edit.delete_success'));
        } catch (error) {
            console.error('Failed to delete group event:', error);
            toast.error(t('dialog.group_event_edit.delete_error'));
        } finally {
            D.loading = false;
        }
    }
</script>
