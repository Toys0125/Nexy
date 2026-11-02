<script setup>
    import { computed } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { getInstanceContentLabel } from '@/shared/utils/instanceDetails';
    import { Badge } from '@/components/ui/badge';

    const props = defineProps({ instance: { type: Object, default: null } });
    const { t } = useI18n();
    const label = computed(() => getInstanceContentLabel(props.instance));
</script>

<template>
    <Badge
        variant="outline"
        :class="{
            'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400':
                label === 'SFW' || label === 'SFW+',
            'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400': label === 'NSFW',
            'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400': label === 'ERP'
        }"
        >{{ label || t('dialog.instance.content_unknown') }}</Badge
    >
</template>
