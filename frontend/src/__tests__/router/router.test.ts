import { vi, describe, it, expect, beforeEach } from 'vitest'

function createMockToken(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: '1', exp: expSeconds }))
  return `${header}.${payload}.signature`
}

describe('Router guards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('detects expired token correctly', () => {
    const expiredToken = createMockToken(Math.floor(Date.now() / 1000) - 3600)
    const payload = JSON.parse(atob(expiredToken.split('.')[1]))
    expect(payload.exp * 1000).toBeLessThan(Date.now())
  })

  it('detects valid token correctly', () => {
    const validToken = createMockToken(Math.floor(Date.now() / 1000) + 3600)
    const payload = JSON.parse(atob(validToken.split('.')[1]))
    expect(payload.exp * 1000).toBeGreaterThan(Date.now())
  })

  it('detects malformed token', () => {
    const malformedToken = 'invalid.token.here'
    expect(() => {
      JSON.parse(atob(malformedToken.split('.')[1]))
    }).toThrow()
  })

  it('protects routes requiring auth', async () => {
    const router = (await import('../../router')).default
    const protectedRoute = router.getRoutes().find(r => r.path === '/')
    expect(protectedRoute?.meta?.requiresAuth).toBe(true)
  })

  it('share routes do not require auth', async () => {
    const router = (await import('../../router')).default
    const shareRoute = router.getRoutes().find(r => r.path === '/share/:token')
    expect(shareRoute?.meta?.requiresAuth).toBeFalsy()
  })

  it('login route does not require auth', async () => {
    const router = (await import('../../router')).default
    const loginRoute = router.getRoutes().find(r => r.path === '/login')
    expect(loginRoute?.meta?.requiresAuth).toBeFalsy()
  })
})
