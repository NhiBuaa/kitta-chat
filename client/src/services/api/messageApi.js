import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL_MESSAGES = import.meta.env.VITE_API_URL_MESSAGES || '/api/messages'

export const getMessages = ({ activeChat, currentUser, cursor, signal }) => {
  const isGroup = Boolean(activeChat.members)
  const url = isGroup
    ? `${API_URL_MESSAGES}/none/${activeChat._id}`
    : `${API_URL_MESSAGES}/${currentUser._id}/${activeChat._id}`

  return axiosClient.get(url, {
    params: {
      ...(isGroup ? { isGroup: true } : {}),
      ...(cursor ? { cursor } : {}),
    },
    signal,
  })
}

export const syncMessages = ({ afterId, limit = 100 }) =>
  axiosClient.get(`${API_URL_MESSAGES}/sync`, {
    params: { after_id: afterId, limit },
  })
