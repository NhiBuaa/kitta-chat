import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL_GROUPS = import.meta.env.VITE_API_URL_GROUPS || '/api/groups'

export const getGroups = () => axiosClient.get(API_URL_GROUPS)

export const createGroup = ({ name, members }) =>
  axiosClient.post(`${API_URL_GROUPS}/`, { name, members })

export const addGroupMember = (groupId, memberId) =>
  axiosClient.post(`${API_URL_GROUPS}/${groupId}/add-member`, { memberId })

export const removeGroupMember = (groupId, memberId) =>
  axiosClient.post(`${API_URL_GROUPS}/${groupId}/remove-member`, { memberId })

export const transferGroupAdmin = (groupId, newAdminId) =>
  axiosClient.post(`${API_URL_GROUPS}/${groupId}/transfer-admin`, { newAdminId })

export const deleteGroup = (groupId) =>
  axiosClient.delete(`${API_URL_GROUPS}/${groupId}`)
