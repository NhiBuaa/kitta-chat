import { axiosClient } from '@/services/api/axiosClient.js';

const API_URL_CALLS = import.meta.env.VITE_API_URL_CALLS;

export const getCallHistory = (cursor) => {
    return axiosClient.get(`${API_URL_CALLS}/history`, {
        params: { cursor }
    })
}
export const getMissedCalls = () => axiosClient.get(`${API_URL_CALLS}/missed`);
export const markCallRead = (callId) => axiosClient.post(`${API_URL_CALLS}/${callId}/read`);
export const markAllCallsRead = () => axiosClient.post(`${API_URL_CALLS}/read-all`);