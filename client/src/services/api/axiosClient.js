import axios from 'axios'
import {
  clearAuthSession,
  getAccessToken,
  setAccessToken,
  setStoredUser,
} from '../auth/authSession.js'

const AUTH_CHANGED_EVENT = 'auth-changed'

const getAuthBaseUrl = () => import.meta.env?.VITE_API_URL_AUTH || '/api/auth'

const defaultRefreshSession = () =>
  axios.post(`${getAuthBaseUrl()}/refresh`, null, {
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
    },
  })

const defaultTokenStore = {
  getAccessToken,
  setAccessToken,
  setStoredUser,
  clearAuthSession,
}

const getRuntimeLocation = () =>
  typeof window !== 'undefined' ? window.location : null

const getRuntimeEventTarget = () =>
  typeof window !== 'undefined' ? window : null

const isAuthRefreshStatus = (status) => [401, 403].includes(status)

const isRefreshRequest = (config = {}) => {
  const url = String(config.url || '')
  return url.includes('/api/auth/refresh') || url.endsWith('/refresh')
}

const dispatchAuthChanged = (eventTarget) => {
  eventTarget?.dispatchEvent?.(new Event(AUTH_CHANGED_EVENT))
}

const redirectToLogin = (location) => {
  if (location && location.pathname !== '/login') {
    location.href = '/login'
  }
}

export const createAxiosClient = ({
  adapter,
  eventTarget = getRuntimeEventTarget(),
  location = getRuntimeLocation(),
  refreshSession = defaultRefreshSession,
  tokenStore = defaultTokenStore,
} = {}) => {
  const client = axios.create({
    adapter,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  client.interceptors.request.use(
    (config) => {
      const token = tokenStore.getAccessToken()

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }

      return config
    },
    (error) => Promise.reject(error),
  )

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config
      const status = error.response?.status

      if (
        !originalRequest ||
        !isAuthRefreshStatus(status) ||
        originalRequest._authRetry ||
        originalRequest.__skipAuthRefresh ||
        isRefreshRequest(originalRequest)
      ) {
        return Promise.reject(error)
      }

      originalRequest._authRetry = true

      try {
        const refreshResponse = await refreshSession()
        const refreshData = refreshResponse?.data || refreshResponse
        const token = refreshData?.token

        if (!refreshData?.success || !token) {
          throw error
        }

        tokenStore.setAccessToken(token)
        if (refreshData.user) {
          tokenStore.setStoredUser(refreshData.user)
        }
        dispatchAuthChanged(eventTarget)

        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${token}`

        return client(originalRequest)
      } catch (refreshError) {
        tokenStore.clearAuthSession()
        dispatchAuthChanged(eventTarget)
        redirectToLogin(location)
        return Promise.reject(refreshError)
      }
    },
  )

  return client
}

export const axiosClient = createAxiosClient()
