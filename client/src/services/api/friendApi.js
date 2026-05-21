import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL_USERS = import.meta.env.VITE_API_URL_USERS || '/api/users'

export const getFriends = () => axiosClient.get(`${API_URL_USERS}/friends`)

export const getFriendRequests = () =>
  axiosClient.get(`${API_URL_USERS}/friend-requests`)

export const sendFriendRequest = (receiverId) =>
  axiosClient.post(`${API_URL_USERS}/friend-request`, { receiverId })

export const acceptFriendRequest = (senderId) =>
  axiosClient.post(`${API_URL_USERS}/accept-friend`, { senderId })

export const rejectFriendRequest = (senderId) =>
  axiosClient.post(`${API_URL_USERS}/reject-friend`, { senderId })

export const removeFriend = (friendId) =>
  axiosClient.post(`${API_URL_USERS}/remove-friend`, { friendId })
