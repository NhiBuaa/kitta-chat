import { PUBLIC_CLIENT_PATHS } from '../../config/publicClientPaths.js'
import { axiosClient } from './axiosClient.js'

const API_URL_GROUPS = PUBLIC_CLIENT_PATHS.groups

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

export const renameGroup = (groupId, newName) =>
  axiosClient.put(`${API_URL_GROUPS}/${groupId}/rename`, { newName })

