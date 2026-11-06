import type {
    Avatar,
    AvatarStyle,
    CurrentUser,
    File,
    GetLicensedAvatars,
    GroupGalleryFileOrder,
    GroupGalleryFileOrderRequest,
    SearchAvatars,
    ServiceStatus,
    UpdateAvatarRequest
} from 'vrchat';
import type { Json } from '../types/vrcx';
import { patchAndRefetchActiveQuery, queryKeys } from '../queries';
import { request } from '../services/request';
import { applyCurrentUser } from '../coordinators/userCoordinator';

const avatarReq = {
    // Not available on NexVR: the shim answers 501
    getAvatar(params: { avatarId: string }): Promise<{ json: Json<Avatar>; params: { avatarId: string } }> {
        return request(`avatars/${params.avatarId}`, {
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
    getAvatars(params: SearchAvatars['query']): Promise<{ json: Json<Avatar[]>; params: SearchAvatars['query'] }> {
        return request('avatars', {
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
    saveAvatar(params: UpdateAvatarRequest): Promise<{ json: Json<Avatar>; params: UpdateAvatarRequest }> {
        return request(`avatars/${params.id}`, {
            method: 'PUT',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            patchAndRefetchActiveQuery({
                queryKey: queryKeys.avatar(params.id),
                nextData: args
            }).catch((err) => {
                console.error('Failed to refresh avatar query after mutation:', err);
            });
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    selectAvatar(params: { avatarId: string }): Promise<{ json: Json<CurrentUser>; params }> {
        return request(`avatars/${params.avatarId}/select`, {
            method: 'PUT',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            const ref = applyCurrentUser(json);
            patchAndRefetchActiveQuery({
                queryKey: queryKeys.user(ref.id),
                nextData: {
                    json,
                    params: { userId: ref.id },
                    ref
                }
            }).catch((err) => {
                console.error('Failed to refresh current user query after avatar select:', err);
            });
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    selectFallbackAvatar(params: { avatarId: string }): Promise<{ json: Json<CurrentUser>; params }> {
        return request(`avatars/${params.avatarId}/selectfallback`, {
            method: 'PUT',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            const ref = applyCurrentUser(json);
            patchAndRefetchActiveQuery({
                queryKey: queryKeys.user(ref.id),
                nextData: {
                    json,
                    params: { userId: ref.id },
                    ref
                }
            }).catch((err) => {
                console.error('Failed to refresh current user query after fallback avatar select:', err);
            });
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    deleteAvatar(params: { avatarId: string }): Promise<{ json: Json<Avatar>; params }> {
        return request(`avatars/${params.avatarId}`, {
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
    createImposter(params: { avatarId: string }): Promise<{ json: Json<ServiceStatus>; params }> {
        return request(`avatars/${params.avatarId}/impostor/enqueue`, {
            method: 'POST'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    deleteImposter(params: { avatarId: string }): Promise<{ json: unknown; params }> {
        return request(`avatars/${params.avatarId}/impostor`, {
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
    getAvailableAvatarStyles(): Promise<{ json: Json<AvatarStyle[]> }> {
        return request('avatarStyles', {
            method: 'GET'
        }).then((json) => {
            const args = {
                json
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getAvatarGallery(
        avatarId: string
    ): Promise<{ json: Json<File[]>; params: { tag: string; galleryId: string; n: number; offset: number } }> {
        const params = {
            tag: 'avatargallery',
            galleryId: avatarId,
            n: 100,
            offset: 0
        };
        return request(`files`, {
            params,
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
    uploadAvatarImage(imageData: string): Promise<{ json: Json<File>; params: { tag: string } }> {
        const params = {
            tag: 'avatarimage'
        };
        return request('file/image', {
            uploadImage: true,
            matchingDimensions: false,
            postData: JSON.stringify(params),
            imageData
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    uploadAvatarGalleryImage(imageData: string, avatarId: string): Promise<{ json: Json<File>; params: any }> {
        const params = {
            tag: 'avatargallery',
            galleryId: avatarId
        };
        return request('file/image', {
            uploadImage: true,
            matchingDimensions: false,
            postData: JSON.stringify(params),
            imageData
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    setAvatarGalleryOrder(
        order: string[],
        galleryId: string
    ): Promise<{ json: Json<GroupGalleryFileOrder>; params: GroupGalleryFileOrderRequest }> {
        const params = {
            ids: order,
            galleryId
        };
        return request('files/order', {
            method: 'PUT',
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
    getLicensedAvatars(
        params: GetLicensedAvatars['query']
    ): Promise<{ json: Json<Avatar[]>; params: GetLicensedAvatars['query'] }> {
        return request('avatars/licensed', {
            method: 'GET',
            params
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    }
};

export default avatarReq;
