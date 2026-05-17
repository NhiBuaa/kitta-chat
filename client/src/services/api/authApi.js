import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL_AUTH;

console.log("Check API URL:", API_URL);

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
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
