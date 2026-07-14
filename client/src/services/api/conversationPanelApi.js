import { axiosClient } from '@/services/api/axiosClient.js'

const API_URL = '/api/conversations'

export const getPanelMetadata = (conversationId) =>
  axiosClient.get(`${API_URL}/${conversationId}/panel/metadata`, {
    __skipAuthRefresh: true,
  })

export const getPanelResources = (conversationId, scopes = "") => {
  const query = scopes ? `?scopes=${scopes}` : "";
  return axiosClient.get(`${API_URL}/${conversationId}/panel/resources${query}`, {
    __skipAuthRefresh: true,
  });
}
