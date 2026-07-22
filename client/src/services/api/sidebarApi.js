import { axiosClient } from './axiosClient.js';

export const getSidebarConversations = (params = {}, config = {}) => {
  return axiosClient.get('/api/sidebar/conversations', {
    params,
    ...config,
  });
};
