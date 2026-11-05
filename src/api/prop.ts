import type { Prop } from 'vrchat';
import type { Json } from '../types/vrcx';
import { request } from '../services/request';

const propReq = {
    // Not available on NexVR: the shim answers 501
    getProp(params: { propId: string }): Promise<{ json: Json<Prop>; params }> {
        return request(`props/${params.propId}`, {
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

export default propReq;
