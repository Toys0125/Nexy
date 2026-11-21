<script setup>
    import { Badge } from '@/components/ui/badge';
    import { useI18n } from 'vue-i18n';

    defineProps({
        ratings: {
            type: /** @type {import('vue').PropType<import('./useAvatarImpact').AvatarImpactRating[] | null>} */ (
                Array
            ),
            default: null
        }
    });

    const { t } = useI18n();
</script>

<template>
    <div v-if="ratings" class="flex flex-wrap items-center gap-1.5">
        <span v-if="!ratings.length" class="text-xs text-muted-foreground">{{
            t('dialog.avatar.impact.unavailable')
        }}</span>
        <Badge v-for="rating in ratings" :key="rating.platform" variant="outline">
            {{
                t('dialog.avatar.impact.badge', {
                    level: t(`dialog.avatar.impact.${rating.level}`),
                    platform: rating.platform
                })
            }}
        </Badge>
    </div>
</template>
