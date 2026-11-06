import type {
    BoopRequest,
    File,
    FileAnalysis,
    GetStore,
    InfoPush,
    Instance,
    Store,
    Success,
    UpdateUserBadgeRequest,
    UpdateUserNoteRequest,
    UpdateUserNoteResponse
} from 'vrchat';
import type { Json } from '../types/vrcx';
import { queryClient, queryKeys } from '../queries';
import { request } from '../services/request';
import { useUserStore } from '../stores';

function getCurrentUserId() {
    return useUserStore().currentUser.id;
}

const miscReq = {
    // Not available on NexVR: the shim answers 501
    getFile(params: { fileId: string }): Promise<{ json: Json<File>; params: { fileId: string } }> {
        return request(`file/${params.fileId}`, {
            method: 'GET'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    saveNote(
        params: UpdateUserNoteRequest
    ): Promise<{ json: Json<UpdateUserNoteResponse>; params: UpdateUserNoteRequest }> {
        return request('userNotes', {
            method: 'POST',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getFileAnalysis(params: {
        fileId: string;
        version: number;
        variant: string;
    }): Promise<{ json: Json<FileAnalysis>; params }> {
        return request(`analysis/${params.fileId}/${params.version}/${params.variant}`, {
            method: 'GET'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getStore(params: GetStore['query']): Promise<{ json: Json<Store>; params: GetStore['query'] }> {
        return request('economy/store', {
            method: 'GET',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    closeInstance(params: { location: string; hardClose: boolean }): Promise<{ json: Json<Instance>; params }> {
        return request(`instances/${params.location}`, {
            method: 'DELETE',
            params: {
                hardClose: params.hardClose ?? false
            }
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    deleteWorldPersistData(params: { worldId: string }): Promise<{ json: unknown; params }> {
        return request(`users/${getCurrentUserId()}/${params.worldId}/persist`, {
            method: 'DELETE'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    hasWorldPersistData(params: { worldId: string }): Promise<{ json: unknown; params }> {
        return request(`users/${getCurrentUserId()}/${params.worldId}/persist/exists`, {
            method: 'GET'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    updateBadge(
        params: { badgeId: string } & UpdateUserBadgeRequest
    ): Promise<{ json: unknown; params: { badgeId: string } & UpdateUserBadgeRequest }> {
        return request(`users/${getCurrentUserId()}/badges/${params.badgeId}`, {
            method: 'PUT',
            params: {
                userId: getCurrentUserId(),
                badgeId: params.badgeId,
                hidden: params.hidden,
                showcased: params.showcased
            }
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getVisits(): Promise<{ json: number }> {
        return request('visits', {
            method: 'GET'
        }).then((json) => {
            const args = {
                json
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    deleteFile(fileId: string): Promise<{ json: Json<File>; fileId: string }> {
        return request(`file/${fileId}`, {
            method: 'DELETE'
        }).then((json) => {
            const args = {
                json,
                fileId
            };
            queryClient.removeQueries({
                queryKey: queryKeys.file(fileId),
                exact: true
            });
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    sendBoop(
        params: { userId: string } & BoopRequest
    ): Promise<{ json: Json<Success>; params: { userId: string } & BoopRequest }> {
        return request(`users/${params.userId}/boop`, {
            method: 'POST',
            params: {
                emojiId: params.emojiId
                // inventoryItemId
            }
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getInfoPush(params: { require?: string; include?: string[] }): Promise<{ json: Json<InfoPush[]>; params }> {
        const query: Record<string, any> = {
            require: params.require,
            include: params.include
        };
        return request('infoPush', {
            method: 'GET',
            params: query
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    }
};

export default miscReq;
