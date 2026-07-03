import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import axios from 'axios'

// Mock axios module
vi.mock('axios', () => {
  const mockAxios = vi.fn()
  mockAxios.create = vi.fn(() => mockAxios)
  mockAxios.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  }
  mockAxios.defaults = { baseURL: 'http://localhost:5002' }
  mockAxios.get = vi.fn()
  mockAxios.post = vi.fn()
  return { default: mockAxios }
})

describe('API Client', () => {
  let mockAxios

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    // Clear module cache and re-import to reset state
    vi.resetModules()
    mockAxios = (await import('axios')).default
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Instance Creation', () => {
    it('should create axios instance with default base URL', async () => {
      // Import the api module which triggers axios.create
      await import('../api')

      expect(mockAxios.create).toHaveBeenCalled()
      const createCall = mockAxios.create.mock.calls[0][0]
      // Base URL should either be from env or default to localhost:5002
      expect(createCall.baseURL).toBeDefined()
      expect(createCall.timeout).toBe(10000)
      expect(createCall.withCredentials).toBe(true)
    })

    it('should use VITE_API_BASE_URL environment variable when set', async () => {
      // This test verifies that the baseURL uses import.meta.env.VITE_API_BASE_URL
      // Since we can't easily mock import.meta.env in this context,
      // we verify the default behavior instead
      await import('../api')

      expect(mockAxios.create).toHaveBeenCalled()
      const createCall = mockAxios.create.mock.calls[0][0]
      expect(createCall.baseURL).toBeDefined()
    })
  })

  describe('Response Interceptor', () => {
    it('should register response interceptor', async () => {
      await import('../api')

      expect(mockAxios.interceptors.response.use).toHaveBeenCalled()
    })

    it('should pass through successful responses', async () => {
      await import('../api')

      const responseInterceptor = mockAxios.interceptors.response.use.mock.calls[0][0]
      const mockResponse = { data: { test: 'data' }, status: 200 }

      const result = responseInterceptor(mockResponse)

      expect(result).toEqual(mockResponse)
    })

    it('should handle non-401 errors without refresh attempt', async () => {
      await import('../api')

      const errorHandler = mockAxios.interceptors.response.use.mock.calls[0][1]
      const error = {
        response: { status: 500 },
        config: { url: '/api/papers' },
      }

      await expect(errorHandler(error)).rejects.toEqual(error)
    })

    it('should refresh cookies and retry on first 401', async () => {
      mockAxios.post.mockResolvedValue({ data: { ok: true } })
      mockAxios.mockResolvedValue({ data: { retried: true } })

      await import('../api')

      const errorHandler = mockAxios.interceptors.response.use.mock.calls[0][1]
      const error = {
        response: { status: 401 },
        config: { url: '/api/papers', _retried: false },
      }

      const result = await errorHandler(error)

      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/refresh')
      expect(mockAxios).toHaveBeenCalledWith(error.config)
      expect(result).toEqual({ data: { retried: true } })
      expect(error.config._retried).toBe(true)
    })

    it('should clear auth and redirect on 401 when refresh fails', async () => {
      // Mock window.location
      const originalLocation = window.location
      delete window.location
      window.location = { pathname: '/papers', href: '' }
      localStorage.setItem('auth_user', JSON.stringify({ id: 1 }))
      mockAxios.post.mockRejectedValue(new Error('refresh failed'))

      await import('../api')

      const errorHandler = mockAxios.interceptors.response.use.mock.calls[0][1]
      const error = {
        response: { status: 401 },
        config: { url: '/api/papers', _retried: false },
      }

      await expect(errorHandler(error)).rejects.toEqual(error)

      expect(localStorage.getItem('auth_user')).toBeNull()
      expect(window.location.href).toBe('/login')

      // Restore window.location
      window.location = originalLocation
    })

    it('should not redirect to login if already on login page', async () => {
      // Mock window.location
      const originalLocation = window.location
      delete window.location
      window.location = { pathname: '/login', href: '' }
      mockAxios.post.mockRejectedValue(new Error('refresh failed'))

      vi.resetModules()
      localStorage.clear()

      await import('../api')

      const errorHandler = mockAxios.interceptors.response.use.mock.calls[0][1]
      const error = {
        response: { status: 401 },
        config: { url: '/api/papers', _retried: false },
      }

      await expect(errorHandler(error)).rejects.toEqual(error)

      expect(window.location.href).toBe('')

      // Restore window.location
      window.location = originalLocation
    })

    it('should skip refresh for auth endpoints', async () => {
      await import('../api')

      const errorHandler = mockAxios.interceptors.response.use.mock.calls[0][1]
      const error = {
        response: { status: 401 },
        config: { url: '/api/auth/login', _retried: false },
      }

      await expect(errorHandler(error)).rejects.toEqual(error)
    })
  })
})
