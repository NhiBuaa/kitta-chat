import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL_USERS = import.meta.env.VITE_API_URL_USERS || '/api/users'

export const getUserProfile = () => axiosClient.get(`${API_URL_USERS}/profile`)

export const updateUserProfile = (payload, config) =>
  axiosClient.put(`${API_URL_USERS}/profile`, payload, config)

export const getSidebarUsers = () => axiosClient.get(`${API_URL_USERS}/sidebar-list`)

export const getOnlineFriends = () => axiosClient.get(`${API_URL_USERS}/online-friends`)

export const searchUsers = (keyword) =>
  axiosClient.get(`${API_URL_USERS}/search`, {
    params: { keyword },
  })
