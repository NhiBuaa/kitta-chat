import axios from "axios";
import { getAccessToken } from "@/services/auth/authSession.js";

const API_URL = import.meta.env.VITE_API_URL_AUTH;

console.log("Check API URL:", API_URL);

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

export const register = (data) => axiosInstance.post("/register", data);
export const login = (data) => axiosInstance.post("/login", data);
export const loginWithGoogle = (data) => axiosInstance.post("/google", data);
export const getSession = () => axiosInstance.get("/session");
export const refreshSession = () => axiosInstance.post("/refresh");
export const logoutSession = () => axiosInstance.post("/logout");
export const changePassword = (data) =>
  axiosInstance.post("/change-password", data);
export const forgotPassword = (data) =>
  axiosInstance.post("/forgot-password", data);
export const resetPassword = (id, token, newPassword) => {
  return axiosInstance.post(`/reset-password/${id}/${token}`, {
    newPassword,
    confirmPassword: newPassword,
  });
};
