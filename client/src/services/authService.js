import axios from 'axios';

const API_URL = '/api/auth';

const axiosInstance = axios.create({
    headers: {
        'Content-Type': 'application/json',
    }
});

axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const register = (data) => axiosInstance.post(`${API_URL}/register`, data);
export const login = (data) => axiosInstance.post(`${API_URL}/login`, data);
export const changePassword = (data) => axiosInstance.post(`${API_URL}/change-password`, data);
// Forgot password sẽ làm ở phần sau