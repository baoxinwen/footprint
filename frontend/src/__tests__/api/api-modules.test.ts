import { vi, describe, it, expect, beforeEach } from 'vitest'
import request from '../../api/request'

vi.mock('../../api/request', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

describe('shares API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createShare calls POST /shares/:tripId', async () => {
    const { createShare } = await import('../../api/shares')
    await createShare(5)
    expect(request.post).toHaveBeenCalledWith('/shares/5')
  })

  it('viewShare calls GET /shares/view/:token', async () => {
    const { viewShare } = await import('../../api/shares')
    await viewShare('abc-123-token')
    expect(request.get).toHaveBeenCalledWith('/shares/view/abc-123-token')
  })
})

describe('timeline API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getTimeline calls GET /timeline', async () => {
    const { getTimeline } = await import('../../api/timeline')
    await getTimeline()
    expect(request.get).toHaveBeenCalledWith('/timeline')
  })
})

describe('auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('register calls POST /auth/register', async () => {
    const { register } = await import('../../api/auth')
    await register('testuser', 'password123')
    expect(request.post).toHaveBeenCalledWith('/auth/register', {
      username: 'testuser',
      password: 'password123',
    })
  })

  it('login calls POST /auth/login', async () => {
    const { login } = await import('../../api/auth')
    await login('testuser', 'password123')
    expect(request.post).toHaveBeenCalledWith('/auth/login', {
      username: 'testuser',
      password: 'password123',
    })
  })

  it('changePassword calls POST /auth/change-password', async () => {
    const { changePassword } = await import('../../api/auth')
    await changePassword('oldPass', 'newPass123')
    expect(request.post).toHaveBeenCalledWith('/auth/change-password', {
      current_password: 'oldPass',
      new_password: 'newPass123',
    })
  })
})
