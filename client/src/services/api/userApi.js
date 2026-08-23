import { PUBLIC_CLIENT_PATHS } from '../../config/publicClientPaths.js'
import { axiosClient } from './axiosClient.js'

const API_URL_USERS = PUBLIC_CLIENT_PATHS.users

export const getUserProfile = () => axiosClient.get(`${API_URL_USERS}/profile`)

export const updateUserProfile = (payload, config) =>
  axiosClient.put(`${API_URL_USERS}/profile`, payload, config)

export const getSidebarUsers = () => axiosClient.get(`${API_URL_USERS}/sidebar-list`)

export const getOnlineFriends = () => axiosClient.get(`${API_URL_USERS}/online-friends`)

export const searchUsers = (keyword) =>
  axiosClient.get(`${API_URL_USERS}/search`, {
    params: { keyword },
  })
