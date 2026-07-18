import { axiosClient } from './axiosClient.js'

const API_URL = '/api/conversations'

export const getPanelMetadata = (conversationId) =>
  axiosClient.get(`${API_URL}/${conversationId}/panel/metadata`, {
    __skipAuthRefresh: true,
  })

export const getPanelResources = (conversationId, scopes = "", cursor = null) => {
  const params = new URLSearchParams();
  if (scopes) params.append("scopes", scopes);
  if (cursor) params.append("cursor", cursor);
  const query = params.toString() ? `?${params.toString()}` : "";
  return axiosClient.get(`${API_URL}/${conversationId}/panel/resources${query}`, {
    __skipAuthRefresh: true,
  });
}

export const updatePanelPreference = (conversationId, preferenceData) =>
  axiosClient.patch(`${API_URL}/${conversationId}/panel/preference`, preferenceData, {
    __skipAuthRefresh: true,
  });

export const leaveGroupPanel = (conversationId) =>
  axiosClient.post(`${API_URL}/${conversationId}/panel/leave`, {}, {
    __skipAuthRefresh: true,
  });

export const deleteChatPanel = (conversationId) =>
  axiosClient.post(`${API_URL}/${conversationId}/panel/delete`, {}, {
    __skipAuthRefresh: true,
  });
