<script setup>
    import { computed, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { ArrowUpRight, Copy, Globe2, Image, LogIn, RefreshCw, User, Users, X } from 'lucide-vue-next';
    import { Button } from '@/components/ui/button';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
    import DialogDescription from '@/components/ui/dialog/DialogDescription.vue';
    import DialogHeader from '@/components/ui/dialog/DialogHeader.vue';
    import DialogTitle from '@/components/ui/dialog/DialogTitle.vue';
    import InstanceContentBadge from '@/components/InstanceContentBadge.vue';
    import { getInstanceAccessKey } from '@/shared/utils/instanceDetails';
    import { parseLocation, translateAccessType } from '@/shared/utils/locationParser';
    import { accessTypeLocaleKeyMap } from '@/shared/constants/accessType';
    import { formatDateFilter } from '@/coordinators/dateCoordinator';

    /**
     * @typedef {{
     *     id: string;
     *     displayName: string;
     *     profilePicOverride?: string;
     *     userIcon?: string;
     *     currentAvatarThumbnailImageUrl?: string;
     * }} InstanceFriend
     */

    const props = defineProps({
        location: { type: String, required: true },
        instance: { type: Object, default: null },
        world: { type: Object, default: null },
        friends: {
            type: /** @type {import('vue').PropType<InstanceFriend[]>} */ (Array),
            default: () => []
        },
        loading: Boolean,
        error: Boolean
    });
    defineEmits(['refresh', 'close', 'join', 'world', 'owner', 'user', 'copy']);
    const { t } = useI18n();
    const imageError = ref(false);
    watch(
        () => props.world?.thumbnailImageUrl,
        () => {
            imageError.value = false;
        }
    );
    const parsed = computed(() => parseLocation(props.instance?.location || props.location));
    const ownerId = computed(
        () =>
            props.instance?.creatorId ||
            (props.instance?.type !== 'group' ? props.instance?.ownerId : '') ||
            parsed.value.userId ||
            ''
    );
    const access = computed(() => {
        const key = getInstanceAccessKey(props.instance);
        return key ? t(key) : translateAccessType(parsed.value.accessTypeName, t, accessTypeLocaleKeyMap);
    });
    const unknown = computed(() => t('dialog.instance.unknown'));
    const closed = computed(() => Boolean(props.instance?.closedAt || props.instance?.active === false));
    const count = computed(() => props.instance?.userCount ?? props.instance?.n_users);
    /** Follow the app's date preferences, retaining an unknown label for absent or invalid dates. */
    function formatDate(value) {
        if (!value) return unknown.value;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? unknown.value : formatDateFilter(value, 'long');
    }
    const details = computed(() => [
        { label: t('dialog.instance.access'), value: access.value || unknown.value },
        {
            label: t('dialog.instance.region'),
            value: props.instance?.$nexvr?.region || parsed.value.region?.toUpperCase() || unknown.value
        },
        {
            label: t('dialog.instance.players'),
            value: props.instance ? `${count.value ?? 0} / ${props.instance.capacity || unknown.value}` : unknown.value
        },
        {
            label: t('dialog.instance.lifetime'),
            value:
                props.instance?.$nexvr?.detailsFetched === true
                    ? t(props.instance.$nexvr.ephemeral ? 'dialog.instance.temporary' : 'dialog.instance.persistent')
                    : unknown.value
        },
        { label: t('dialog.instance.created'), value: formatDate(props.instance?.$nexvr?.createdAt) },
        {
            label: t(closed.value ? 'dialog.instance.closed_at' : 'dialog.instance.closes_at'),
            value: closed.value
                ? formatDate(props.instance.closedAt)
                : props.instance?.$nexvr?.closesAt
                  ? formatDate(props.instance.$nexvr.closesAt)
                  : props.instance?.$nexvr?.detailsFetched === true
                    ? t('dialog.instance.not_scheduled')
                    : unknown.value
        }
    ]);
</script>

<template>
    <div class="flex min-h-0 min-w-0 flex-col gap-4" :aria-busy="loading">
        <DialogHeader class="flex-row items-start justify-between gap-3 space-y-0">
            <div class="min-w-0 space-y-1">
                <DialogTitle>{{ t('dialog.instance.title') }}</DialogTitle>
                <DialogDescription>{{ t('dialog.instance.subtitle') }}</DialogDescription>
            </div>
            <div class="flex shrink-0 gap-1">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    :disabled="loading"
                    :aria-label="t('common.actions.refresh')"
                    @click="$emit('refresh')">
                    <RefreshCw :class="['size-4', { 'animate-spin': loading }]" />
                </Button>
                <Button variant="ghost" size="icon-sm" :aria-label="t('dialog.instance.close')" @click="$emit('close')"
                    ><X class="size-4"
                /></Button>
            </div>
        </DialogHeader>

        <div v-if="error" role="alert" class="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {{ t('dialog.instance.load_error') }}
            <Button variant="link" size="sm" @click="$emit('refresh')">{{ t('dialog.instance.retry') }}</Button>
        </div>

        <div class="grid min-h-0 gap-4 overflow-y-auto md:grid-cols-[280px_minmax(0,1fr)]">
            <aside class="flex min-w-0 flex-col gap-3">
                <div class="overflow-hidden rounded-xl bg-(--profile-card)">
                    <div class="relative flex aspect-4/3 items-center justify-center bg-muted">
                        <img
                            v-if="world?.thumbnailImageUrl && !imageError"
                            :src="world.thumbnailImageUrl"
                            :alt="world.name"
                            class="absolute inset-0 size-full object-cover"
                            @error="imageError = true" />
                        <Image v-else class="size-10 text-muted-foreground" />
                    </div>
                    <div class="space-y-3 p-4">
                        <div>
                            <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                {{ t('dialog.instance.world') }}
                            </div>
                            <div class="break-words font-semibold">{{ world?.name || unknown }}</div>
                            <div v-if="world?.authorName" class="mt-1 text-xs text-muted-foreground">
                                {{ world.authorName }}
                            </div>
                        </div>
                        <Button variant="outline" class="w-full justify-between" @click="$emit('world')">
                            {{ t('dialog.instance.view_world') }}<ArrowUpRight class="size-4" />
                        </Button>
                    </div>
                </div>
                <Button class="w-full" :disabled="closed || instance?.full || loading" @click="$emit('join')">
                    <LogIn class="size-4" />{{
                        t(
                            closed
                                ? 'dialog.instance.closed'
                                : instance?.full
                                  ? 'dialog.instance.full'
                                  : 'dialog.instance.join'
                        )
                    }}
                </Button>
            </aside>

            <div class="min-w-0 space-y-3">
                <section class="space-y-4 rounded-xl bg-(--profile-card) p-4">
                    <div class="flex flex-wrap items-center gap-2">
                        <InstanceContentBadge :instance="instance" />
                        <span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                            ><Globe2 class="size-3.5" />{{ access }}</span
                        >
                        <span
                            v-if="instance"
                            class="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span
                                :class="[
                                    'size-1.5 rounded-full',
                                    closed ? 'bg-muted-foreground' : 'bg-emerald-500'
                                ]"></span>
                            {{ t(closed ? 'dialog.instance.closed' : 'dialog.instance.active') }}
                        </span>
                    </div>
                    <div>
                        <h2 class="break-words text-lg font-semibold">
                            {{ instance?.displayName || world?.name || t('dialog.instance.title') }}
                        </h2>
                        <p class="mt-1 break-all font-mono text-xs text-muted-foreground">#{{ parsed.instanceName }}</p>
                    </div>
                    <div class="border-t pt-3">
                        <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {{ t('dialog.instance.owner') }}
                        </div>
                        <button
                            v-if="ownerId"
                            type="button"
                            class="inline-flex max-w-full items-center gap-2 text-sm text-primary hover:underline"
                            @click="$emit('owner', ownerId)">
                            <User class="size-4 shrink-0" /><span class="truncate">{{
                                instance?.$nexvr?.creatorName || ownerId
                            }}</span
                            ><ArrowUpRight class="size-3 shrink-0" />
                        </button>
                        <span v-else class="text-sm text-muted-foreground">{{ unknown }}</span>
                    </div>
                </section>

                <section class="rounded-xl bg-(--profile-card) p-4">
                    <h3 class="mb-3 border-b pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {{ t('dialog.instance.details') }}
                    </h3>
                    <dl class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <div v-for="detail in details" :key="detail.label" class="min-w-0">
                            <dt class="mb-1 text-xs text-muted-foreground">{{ detail.label }}</dt>
                            <dd class="break-words text-sm">{{ detail.value }}</dd>
                        </div>
                    </dl>
                </section>

                <section class="rounded-xl bg-(--profile-card) p-4">
                    <h3
                        class="mb-3 flex items-center gap-2 border-b pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        <Users class="size-3.5" />{{ t('dialog.instance.friends_here', { count: friends.length }) }}
                    </h3>
                    <div v-if="friends.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                            v-for="friend in friends"
                            :key="friend.id"
                            type="button"
                            class="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left hover:bg-accent"
                            @click="$emit('user', friend.id)">
                            <Avatar class="size-8 shrink-0"
                                ><AvatarImage
                                    :src="
                                        friend.profilePicOverride ||
                                        friend.userIcon ||
                                        friend.currentAvatarThumbnailImageUrl ||
                                        ''
                                    " /><AvatarFallback><User class="size-4" /></AvatarFallback
                            ></Avatar>
                            <span class="truncate text-sm">{{ friend.displayName }}</span>
                        </button>
                    </div>
                    <p v-else class="text-xs text-muted-foreground">{{ t('dialog.instance.no_friends') }}</p>
                </section>
            </div>
        </div>

        <div class="flex min-w-0 items-center gap-3 border-t pt-3">
            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" :title="location">{{
                location
            }}</span>
            <Button variant="outline" size="sm" @click="$emit('copy')"
                ><Copy class="size-3.5" />{{ t('dialog.instance.copy_link') }}</Button
            >
        </div>
    </div>
</template>
