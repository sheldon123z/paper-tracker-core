import axios from 'axios'
import { API_BASE_URL } from './config/runtime'

// JWT tokens are now stored in httpOnly cookies (set by the backend).
// The browser sends cookies automatically when withCredentials is true.
// No token is stored in localStorage — this prevents XSS token theft.
const api = axios.create({
  // API paths already start with /api. An empty base URL keeps browser
  // requests on the origin that served the production UI.
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true, // send httpOnly cookies with every request
})

// ---- Auth interceptors ----

// Response: handle 401 with automatic cookie-based token refresh
let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Skip refresh for auth endpoints and callers that explicitly opt out.
    const shouldSkipRefresh = originalRequest.skipAuthRefresh
      || ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'].includes(originalRequest.url)
    if (shouldSkipRefresh) {
      return Promise.reject(error)
    }

    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(() => {
          // Cookie is already updated by the refresh response — just retry
          return api(originalRequest)
        })
      }

      isRefreshing = true

      try {
        // POST to /api/auth/refresh — refresh_token cookie is sent automatically
        await api.post('/api/auth/refresh')

        // Retry queued requests (cookies already refreshed)
        refreshQueue.forEach((p) => p.resolve())
        refreshQueue = []

        return api(originalRequest)
      } catch {
        refreshQueue.forEach((p) => p.reject(error))
        refreshQueue = []
        _clearAuthAndRedirect()
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

function _clearAuthAndRedirect() {
  localStorage.removeItem('auth_user')
  // Only redirect if not already on login page
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

export default api
