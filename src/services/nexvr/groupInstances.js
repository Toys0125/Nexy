import { watch } from 'vue';

import { useGroupStore } from '../../stores/group';
import { useInstanceStore } from '../../stores/instance';
import { handleGroupUserInstances } from '../../coordinators/groupCoordinator';
import { realtime } from './realtime';

/** Feed realtime snapshots into the existing sidebar and group dialog stores. */
export function startGroupInstances() {
    const groups = useGroupStore();
    const instances = useInstanceStore();

    const refresh = () => {
        handleGroupUserInstances({
            json: { instances: realtime.getGroupInstances([...groups.currentUserGroups.keys()]) }
        });
        const dialog = groups.groupDialog;
        if (dialog.visible && dialog.id) {
            const snapshot = realtime.getGroupInstances([dialog.id]);
            const refs = snapshot.map((instance) => instances.applyInstance(instance));
            instances.applyGroupDialogInstances(refs);
        }
    };
    const off = realtime.on('groupInstances', refresh);
    const stop = watch(
        () => [...groups.currentUserGroups.keys(), groups.groupDialog.visible ? groups.groupDialog.id : ''],
        (groupIds) => {
            realtime.watchGroups(groupIds);
            refresh();
        },
        { immediate: true }
    );
    return () => {
        stop();
        off();
    };
}
