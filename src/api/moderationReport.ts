import type {
    GetModerationReports,
    ModerationReport,
    PaginatedModerationReportList,
    SubmitModerationReportRequest,
    SuccessFlag
} from 'vrchat';
import type { Json } from '../types/vrcx';
import { request } from '../services/request';

const moderationReportReq = {
    // Not available on NexVR: the shim answers 501
    getModerationReports(
        params: GetModerationReports['query']
    ): Promise<{ json: Json<PaginatedModerationReportList>; params: GetModerationReports['query'] }> {
        return request('moderationReports', {
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
    submitModerationReport(
        params: SubmitModerationReportRequest
    ): Promise<{ json: Json<ModerationReport>; params: SubmitModerationReportRequest }> {
        return request('moderationReports', {
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

    // deprecated
    // Not available on NexVR: the shim answers 501
    deleteModerationReport(params: {
        moderationReportId: string;
    }): Promise<{ json: Json<SuccessFlag>; params: { moderationReportId: string } }> {
        return request(`moderationReports/${params.moderationReportId}`, {
            method: 'DELETE'
        }).then((json) => {
            const args = {
                json,
                params
            };
            return args;
        });
    }
};

export default moderationReportReq;
