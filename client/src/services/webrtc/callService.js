import axios from 'axios';
import { clearAccessToken, getAccessToken } from '@/services/auth/authSession.js';

const API_URL_CALLS = import.meta.env.VITE_API_URL_CALLS;

const axiosInstance = axios.create({
    baseURL: API_URL_CALLS,
    headers: {
        'Content-Type': 'application/json',
    }
})

axiosInstance.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
})

// Xử lý token hêt hạn hoặc không hợp lệ trên tất cả các phản hồi
axiosInstance.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response && error.response.status === 401) {
        clearAccessToken();
        window.location.href = '/login';
    }
    return Promise.reject(error);
})

export const getCallHistory = (cursor) => {
    return axiosInstance.get('/history', {
        params: { cursor }
    })
}
export const getMissedCalls = () => axiosInstance.get('/missed');
export const markCallRead = (callId) => axiosInstance.post(`/${callId}/read`);
export const markAllCallsRead = () => axiosInstance.post('/read-all');