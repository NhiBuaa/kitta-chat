import axios from 'axios';

const API_URL_USERS = import.meta.env.VITE_API_URL_USERS;

const axiosInstance = axios.create({
    baseURL: API_URL_USERS,
    headers: {
        'Content-Type': 'application/json',
    }
})

axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export const getFriends = () => axiosInstance.get('/friends');
export const getFriendRequests = () => axiosInstance.get('/friend-requests');
export const sendFriendRequest = (receiverId) => axiosInstance.post('/friend-request', { receiverId });
export const acceptFriendRequest = (senderId) => axiosInstance.post('/accept-friend', { senderId });
export const searchUsers = (keyword) => axiosInstance.get(`/search?keyword=${keyword}`);