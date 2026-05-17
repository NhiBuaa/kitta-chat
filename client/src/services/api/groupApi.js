import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL_GROUPS = import.meta.env.VITE_API_URL_GROUPS || '/api/groups'

export const getGroups = () => axiosClient.get(API_URL_GROUPS)
