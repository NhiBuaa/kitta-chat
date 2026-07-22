import { axiosClient } from './axiosClient.js';

export const getSidebarConversations = (params = {}, config = {}) => {
  return axiosClient.get('/api/sidebar/conversations', {
    params,
    ...config,
  });
};

export const searchSidebarUsers = (keyword, config = {}) => {
  return axiosClient.get('/api/users/search', {
    params: { keyword },
    ...config,
  });
};
