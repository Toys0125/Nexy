<template>
    <Dialog v-model:open="groupPostEditDialog.visible">
        <DialogContent class="sm:max-w-162.5">
            <DialogHeader>
                <DialogTitle>{{ t('dialog.group.announcements.create') }}</DialogTitle>
            </DialogHeader>

            <!-- NexVR announcements are a title and a message; they can't be edited, only deleted -->
            <div v-if="groupPostEditDialog.visible">
                <FieldGroup class="gap-4">
                    <Field>
                        <FieldLabel>{{ t('dialog.group_post_edit.title') }}</FieldLabel>
                        <FieldContent>
                            <InputGroupField
                                v-model="groupPostEditDialog.title"
                                size="sm"
                                :maxlength="120"
                                show-count />
                        </FieldContent>
                    </Field>
                    <Field>
                        <FieldLabel>{{ t('dialog.group_post_edit.message') }}</FieldLabel>
                        <FieldContent>
                            <InputGroupTextareaField
                                v-model="groupPostEditDialog.text"
                                :rows="4"
                                :maxlength="2000"
                                show-count
                                input-class="resize-none mt-2" />
                        </FieldContent>
                    </Field>
                </FieldGroup>
            </div>

            <DialogFooter>
                <div class="flex gap-2">
                    <Button variant="secondary" @click="groupPostEditDialog.visible = false">
                        {{ t('dialog.group_post_edit.cancel') }}
                    </Button>
                    <Button :disabled="posting || !groupPostEditDialog.text?.trim()" @click="createGroupPost">
                        {{ t('dialog.group.announcements.post') }}
                    </Button>
                </div>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
    import { InputGroupField, InputGroupTextareaField } from '@/components/ui/input-group';
    import { computed, ref } from 'vue';
    import { Button } from '@/components/ui/button';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { groupRequest } from '../../../api';
    import { useGroupStore } from '../../../stores';

    const props = defineProps({
        dialogData: {
            type: Object,
            required: true
        }
    });

    const emit = defineEmits(['update:dialogData']);

    const { t } = useI18n();

    const { handleGroupPost } = useGroupStore();

    const groupPostEditDialog = computed({
        get() {
            return props.dialogData;
        },
        set(value) {
            emit('update:dialogData', value);
        }
    });

    const posting = ref(false);

    function createGroupPost() {
        const D = groupPostEditDialog.value;
        const text = D.text?.trim();
        if (!D.groupId || !text || posting.value) {
            return;
        }
        posting.value = true;
        const openId = D.openId;
        groupRequest
            .createGroupPost({ groupId: D.groupId, title: D.title?.trim() || '', text })
            .then((args) => {
                handleGroupPost(args);
                toast.success(t('dialog.group.announcements.posted'));
                // close only once it's posted, so a failed post keeps the draft for a retry,
                // and only if this is still the draft that was posted
                if (D.openId === openId) {
                    D.visible = false;
                }
            })
            .catch(() => toast.error(t('dialog.group.announcements.post_failed')))
            .finally(() => {
                posting.value = false;
            });
    }
</script>
