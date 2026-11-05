<template>
    <Dialog :open="errorReportDialog.visible" @update:open="(open) => !open && dismissErrorReport()">
        <DialogContent class="sm:max-w-[620px]">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <TriangleAlert class="size-5 text-destructive" />
                    {{ t('dialog.error_report.header') }}
                </DialogTitle>
                <DialogDescription>{{ t('dialog.error_report.description') }}</DialogDescription>
            </DialogHeader>

            <div class="min-w-0 rounded-md border bg-muted/50 p-3">
                <div class="text-sm font-medium break-words text-destructive">{{ errorReportDialog.message }}</div>
                <pre
                    v-if="errorReportDialog.stack"
                    class="mt-2 max-h-56 overflow-auto font-mono text-xs leading-relaxed whitespace-pre text-muted-foreground"
                    >{{ errorReportDialog.stack }}</pre>
            </div>

            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{{ t('dialog.error_report.source') }}: {{ errorReportDialog.source }}</span>
                <span>{{ t('dialog.error_report.version') }}: {{ version }}</span>
                <span v-if="errorReportDialog.extraCount > 0" class="text-destructive">
                    {{ t('dialog.error_report.extra_errors', { count: errorReportDialog.extraCount }) }}
                </span>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="copyDetails">
                    <Copy />
                    {{ t('dialog.error_report.copy') }}
                </Button>
                <Button variant="outline" @click="dismissErrorReport">
                    {{ t('dialog.error_report.dismiss') }}
                </Button>
                <Button @click="openIssue">
                    <Github />
                    {{ t('dialog.error_report.report_on_github') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle
    } from '@/components/ui/dialog';
    import { Copy, Github, TriangleAlert } from 'lucide-vue-next';
    import { Button } from '@/components/ui/button';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import { copyToClipboard } from '../../shared/utils/appActions';
    import { useErrorReportStore } from '../../stores';

    const { t } = useI18n();

    const errorReportStore = useErrorReportStore();
    const { errorReportDialog } = storeToRefs(errorReportStore);
    const { dismissErrorReport, getErrorReportDetails, getErrorReportIssueUrl } = errorReportStore;

    const version = `${VERSION}${NIGHTLY ? ' (Nightly)' : ''}`;

    function copyDetails() {
        copyToClipboard(getErrorReportDetails(), t('dialog.error_report.copied'));
    }

    function openIssue() {
        AppApi.OpenLink(getErrorReportIssueUrl());
        dismissErrorReport();
    }
</script>
