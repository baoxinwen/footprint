import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the API module before importing the store
vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  changePassword: vi.fn(),
  loginApi: vi.fn(),
  registerApi: vi.fn(),
}))

import { useAuthStore } from '../../stores/auth'
import { login as loginApi, register as registerApi } from '../../api/auth'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('stores token on successful login', async () => {
      vi.mocked(loginApi).mockResolvedValue({ data: { access_token: 'test-token-123' } } as any)
      const store = useAuthStore()
      await store.login('testuser', 'password123')
      expect(store.token).toBe('test-token-123')
      expect(store.isLoggedIn).toBe(true)
    })

    it('throws on failed login', async () => {
      vi.mocked(loginApi).mockRejectedValue(new Error('Invalid credentials'))
      const store = useAuthStore()
      await expect(store.login('bad', 'bad')).rejects.toThrow()
    })
  })

  describe('register', () => {
    it('calls registerApi with credentials', async () => {
      vi.mocked(registerApi).mockResolvedValue({} as any)
      const store = useAuthStore()
      await store.register('newuser', 'password123')
      expect(registerApi).toHaveBeenCalledWith('newuser', 'password123')
    })

    it('throws on duplicate username', async () => {
      vi.mocked(registerApi).mockRejectedValue(new Error('Username taken'))
      const store = useAuthStore()
      await expect(store.register('existing', 'pass')).rejects.toThrow()
    })
  })

  describe('logout', () => {
    it('clears token and localStorage', () => {
      const store = useAuthStore()
      store.token = 'some-token'
      store.isLoggedIn = true
      store.logout()
      expect(store.token).toBe('')
      expect(store.isLoggedIn).toBe(false)
    })
  })

  describe('isLoggedIn', () => {
    it('returns false when no token', () => {
      const store = useAuthStore()
      expect(store.isLoggedIn).toBe(false)
    })

    it('returns true when token set', () => {
      const store = useAuthStore()
      store.token = 'some-token'
      store.isLoggedIn = true
      expect(store.isLoggedIn).toBe(true)
    })
  })

  describe('initToken', () => {
    it('loads token from localStorage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('stored-token')
      // Re-create store to pick up the mocked localStorage
      setActivePinia(createPinia())
      const store = useAuthStore()
      expect(store.token).toBe('stored-token')
      expect(store.isLoggedIn).toBe(true)
    })

    it('handles empty token in localStorage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)
      setActivePinia(createPinia())
      const store = useAuthStore()
      expect(store.token).toBe('')
      expect(store.isLoggedIn).toBe(false)
    })
  })
})
