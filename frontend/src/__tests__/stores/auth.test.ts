const gen = (): string => crypto.randomUUID().replaceAll('-', '')
const TEST_PW = gen()
const TEST_TOKEN = gen()
const EXPIRED_TOKEN = 'expired-' + gen()

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  currentRoute: { value: { path: '/trips/1/edit' } },
}))

vi.mock('../../router', () => ({ default: routerMocks }))

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
import { FakeCacheStorage } from '../pwa/fakeCacheStorage'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    routerMocks.currentRoute.value.path = '/trips/1/edit'
    routerMocks.replace.mockResolvedValue(undefined)
  })

  describe('login', () => {
    it('stores token on successful login', async () => {
      vi.mocked(loginApi).mockResolvedValue({ data: { access_token: TEST_TOKEN } } as any)
      const store = useAuthStore()
      await store.login('testuser', TEST_PW)
      expect(store.token).toBe(TEST_TOKEN)
      expect(store.isLoggedIn).toBe(true)
    })

    it('throws on failed login', async () => {
      vi.mocked(loginApi).mockRejectedValue(new Error('Invalid credentials'))
      const store = useAuthStore()
      await expect(store.login('bad', 'bad')).rejects.toThrow()
    })

    it('clears cached private data on login so a previous session cannot leak into this one', async () => {
      // 登出那一刻还没返回的请求，可能在清缓存之后才把数据写回：登录时再清一次兜底
      vi.mocked(loginApi).mockResolvedValue({ data: { access_token: TEST_TOKEN } } as any)
      const storage = new FakeCacheStorage()
      vi.stubGlobal('caches', storage)
      try {
        await storage.seed('api-data', ['/api/trips'])
        await storage.seed('api-thumbs', ['/api/photos/9/thumbnail'])
        await storage.seed('fonts', ['/assets/x.woff2'])

        const store = useAuthStore()
        await store.login('testuser', TEST_PW)

        await vi.waitFor(async () => {
          expect(await storage.keys()).toEqual(['fonts'])
        })
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })

  describe('register', () => {
    it('calls registerApi with credentials', async () => {
      vi.mocked(registerApi).mockResolvedValue({} as any)
      const store = useAuthStore()
      await store.register('newuser', TEST_PW)
      expect(registerApi).toHaveBeenCalledWith('newuser', TEST_PW)
    })

    it('throws on duplicate username', async () => {
      vi.mocked(registerApi).mockRejectedValue(new Error('Username taken'))
      const store = useAuthStore()
      await expect(store.register('existing', 'pass')).rejects.toThrow()
    })
  })

  describe('logout', () => {
    it('clears token and localStorage', async () => {
      const store = useAuthStore()
      store.token = 'some-token'
      store.isLoggedIn = true
      await store.logout()
      expect(store.token).toBe('')
      expect(store.isLoggedIn).toBe(false)
    })

    it('clears private trip drafts without removing unrelated preferences', async () => {
      localStorage.setItem('footprint:trip-draft', 'legacy-private-draft')
      localStorage.setItem('footprint:trip-draft:17', 'user-17-private-draft')
      localStorage.setItem('footprint:trip-draft:23', 'user-23-private-draft')
      localStorage.setItem('theme-mode', 'dark')
      const store = useAuthStore()

      await store.logout()

      expect(localStorage.getItem('footprint:trip-draft')).toBeNull()
      expect(localStorage.getItem('footprint:trip-draft:17')).toBeNull()
      expect(localStorage.getItem('footprint:trip-draft:23')).toBeNull()
      expect(localStorage.getItem('theme-mode')).toBe('dark')
    })

    it('navigates to login before clearing the session', async () => {
      const store = useAuthStore()

      await store.logout()

      expect(routerMocks.replace).toHaveBeenCalledWith('/login')
      expect(routerMocks.push).not.toHaveBeenCalled()
    })

    it('synchronizes store state when another layer invalidates authentication', () => {
      const store = useAuthStore()
      store.token = EXPIRED_TOKEN
      store.isLoggedIn = true

      window.dispatchEvent(new Event('footprint:auth-invalidated'))

      expect(store.token).toBe('')
      expect(store.isLoggedIn).toBe(false)
    })

    it('preserves the session, drafts, store, and route when logout navigation is cancelled', async () => {
      const navigationFailure = { type: 4 }
      routerMocks.replace.mockResolvedValueOnce(navigationFailure)
      localStorage.setItem('token', 'active-token')
      localStorage.setItem('footprint:trip-draft:17', 'private-draft')
      const store = useAuthStore()

      const loggedOut = await store.logout()

      expect(loggedOut).toBe(false)
      expect(localStorage.getItem('token')).toBe('active-token')
      expect(localStorage.getItem('footprint:trip-draft:17')).toBe('private-draft')
      expect(store.token).toBe('active-token')
      expect(store.isLoggedIn).toBe(true)
      expect(routerMocks.currentRoute.value.path).toBe('/trips/1/edit')
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
