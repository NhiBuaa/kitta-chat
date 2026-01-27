import axios from 'axios';

const API_URL_AUTH = import.meta.env.VITE_API_URL_AUTH;

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

export const register = (data) => axios.post(`${API_URL_AUTH}/register`, data);
export const login = (data) => axios.post(`${API_URL_AUTH}/login`, data);
export const changePassword = (data) => axios.post(`${API_URL_AUTH}/change-password`, data);
export const forgotPassword = (data) => axios.post(`${API_URL_AUTH}/forgot-password`, data);
export const resetPassword = async (token, newPassword) => {
    const response = await axios.post(`${API_URL_AUTH}/reset-password/${token}`, {
        newPassword,
        confirmPassword: newPassword
    });
    return response.data;
};