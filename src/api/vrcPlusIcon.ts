import type { File, GetFiles } from 'vrchat';
import type { Json } from '../types/vrcx';
import { queryClient } from '../queries';
import { request } from '../services/request';

function refetchActiveGalleryQueries() {
    queryClient
        .invalidateQueries({
            queryKey: ['gallery'],
            refetchType: 'active'
        })
        .catch((err) => {
            console.error('Failed to refresh gallery queries:', err);
        });
}

const VRCPlusIconsReq = {
    // Not available on NexVR: the shim answers 501
    getFileList(params: GetFiles['query']): Promise<{ json: Json<File[]>; params: GetFiles['query'] }> {
        return request('files', {
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
    deleteFile(fileId: string): Promise<{ json: Json<File>; fileId: string }> {
        return request(`file/${fileId}`, {
            method: 'DELETE'
        }).then((json) => {
            const args = {
                json,
                fileId
            };
            refetchActiveGalleryQueries();
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    uploadVRCPlusIcon(imageData: string): Promise<{ json: Json<File>; params: { tag: string } }> {
        const params = {
            tag: 'icon'
        };
        return request('file/image', {
            uploadImage: true,
            matchingDimensions: true,
            postData: JSON.stringify(params),
            imageData
        }).then((json) => {
            const args = {
                json,
                params
            };
            refetchActiveGalleryQueries();
            return args;
        });
    }

    // deleteFileVersion(params) {
    //     return request(`file/${params.fileId}/${params.version}`, {
    //         method: 'DELETE'
    //     }).then((json) => {
    //         const args = {
    //             json,
    //             params
    //         };
    //         return args;
    //     });
    // }
};

export default VRCPlusIconsReq;
