<script setup>
    import { Copy } from 'lucide-vue-next';
    import { computed, ref, useId } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { Button } from '@/components/ui/button';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
    import { InputGroupAction, InputGroupButton } from '@/components/ui/input-group';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { formatDateFilter } from '@/coordinators/dateCoordinator';
    import { copyToClipboard } from '@/shared/utils/appActions';
    import AvatarImpactBadge from './AvatarImpactBadge.vue';

    const props = defineProps({
        details: {
            type: Object,
            required: true
        },
        impactRatings: {
            type: /** @type {import('vue').PropType<import('./useAvatarImpact').AvatarImpactRating[] | null>} */ (
                Array
            ),
            default: null
        }
    });

    const { t } = useI18n();
    const open = ref(false);
    const selectedVersion = ref('');
    const urlId = useId();
    const keyId = useId();
    const uploadDateLabelId = useId();
    const file = computed(() => {
        const { currentVersion, versions } = props.details;
        return (
            versions.find((version) => version.versionNumber === selectedVersion.value) ??
            versions.find((version) => version.versionNumber === currentVersion) ??
            versions.at(-1)
        );
    });
    const fileImpact = computed(
        () => props.impactRatings?.filter((rating) => rating.versionNumber === file.value.versionNumber) ?? null
    );

    function formatUploadDate(uploadedAt) {
        const date = formatDateFilter(uploadedAt, 'long');
        return date === '-' ? t('dialog.avatar.json.upload_date_unavailable') : date;
    }
</script>

<template>
    <Dialog v-model:open="open">
        <DialogTrigger as-child>
            <Button class="ml-2" size="sm" variant="outline">{{ t('dialog.avatar.json.file_details') }}</Button>
        </DialogTrigger>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ t('dialog.avatar.json.file_details') }}</DialogTitle>
            </DialogHeader>
            <div v-if="details.versions.length > 1" class="grid gap-1.5">
                <span :id="uploadDateLabelId" class="text-sm font-medium">{{
                    t('dialog.avatar.json.upload_date')
                }}</span>
                <Select :model-value="file.versionNumber" @update:model-value="selectedVersion = $event">
                    <SelectTrigger :aria-labelledby="uploadDateLabelId"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem
                            v-for="version in details.versions"
                            :key="version.versionNumber"
                            :value="version.versionNumber">
                            {{ formatUploadDate(version.uploadedAt) }}
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <AvatarImpactBadge :ratings="fileImpact" />
            <div class="grid gap-1.5">
                <label :for="urlId" class="text-sm font-medium">{{ t('dialog.avatar.json.download_url') }}</label>
                <InputGroupAction :id="urlId" :model-value="file.url" readonly input-class="font-mono">
                    <template #actions>
                        <InputGroupButton
                            size="icon-xs"
                            :aria-label="t('dialog.avatar.json.copy_download_url')"
                            @click="copyToClipboard(file.url)">
                            <Copy />
                        </InputGroupButton>
                    </template>
                </InputGroupAction>
            </div>
            <div v-if="open && file.decryptionKey" class="grid gap-1.5">
                <label :for="keyId" class="text-sm font-medium">{{ t('dialog.avatar.json.decryption_key') }}</label>
                <InputGroupAction
                    :key="file.versionNumber"
                    :id="keyId"
                    :model-value="file.decryptionKey"
                    readonly
                    show-password
                    input-class="font-mono">
                    <template #actions>
                        <InputGroupButton
                            size="icon-xs"
                            :aria-label="t('dialog.avatar.json.copy_decryption_key')"
                            @click="copyToClipboard(file.decryptionKey)">
                            <Copy />
                        </InputGroupButton>
                    </template>
                </InputGroupAction>
            </div>
        </DialogContent>
    </Dialog>
</template>
