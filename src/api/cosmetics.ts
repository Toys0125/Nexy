import type { InventoryTemplate } from 'vrchat';
import type { Json } from '../types/vrcx';
import { request } from '../services/request';

const cosmeticsReq = {
    // Not available on NexVR: the shim answers 501
    getProfileEffects(): Promise<{ json: Json<InventoryTemplate[]> }> {
        return request('cosmetics/index/profileEffect', {
            method: 'GET'
        }).then((json) => {
            const args = {
                json
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getIconFrames(): Promise<{ json: Json<InventoryTemplate[]> }> {
        return request('cosmetics/index/iconFrame', {
            method: 'GET'
        }).then((json) => {
            const args = {
                json
            };
            return args;
        });
    },

    // Not available on NexVR: the shim answers 501
    getNameplateEffects(): Promise<{ json: Json<InventoryTemplate[]> }> {
        return request('cosmetics/index/nameplateEffect', {
            method: 'GET'
        }).then((json) => {
            const args = {
                json
            };
            return args;
        });
    }
};

export default cosmeticsReq;
