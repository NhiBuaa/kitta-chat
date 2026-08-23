import { PUBLIC_CLIENT_PATHS } from '../../config/publicClientPaths.js'
import { axiosClient } from './axiosClient.js'

const API_URL_MESSAGES = PUBLIC_CLIENT_PATHS.messages

export const getMessages = ({ activeChat, currentUser, cursor, signal }) => {
  const isGroup = Boolean(activeChat.members)
  const url = `${API_URL_MESSAGES}/${currentUser._id}/${activeChat._id}`

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
