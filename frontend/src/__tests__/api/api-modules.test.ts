const gen = (): string => crypto.randomUUID().replaceAll('-', '')
const TEST_PW = gen()
const OLD_PW = gen()
const NEW_PW = gen()

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

  it('getShares calls GET /shares', async () => {
    const { getShares } = await import('../../api/shares')
    await getShares()
    expect(request.get).toHaveBeenCalledWith('/shares')
  })

  it('getSharedPhotos scopes the request to the share token and location', async () => {
    const { getSharedPhotos } = await import('../../api/shares')
    await getSharedPhotos('abc-123-token', 8)
    expect(request.get).toHaveBeenCalledWith('/shares/view/abc-123-token/locations/8/photos')
  })

  it('rotateShare calls POST /shares/:tripId/rotate', async () => {
    const { rotateShare } = await import('../../api/shares')
    await rotateShare(5)
    expect(request.post).toHaveBeenCalledWith('/shares/5/rotate')
  })

  it('revokeShare calls DELETE /shares/:token', async () => {
    const { revokeShare } = await import('../../api/shares')
    await revokeShare('abc-123-token')
    expect(request.delete).toHaveBeenCalledWith('/shares/abc-123-token')
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
    await register('testuser', TEST_PW)
    expect(request.post).toHaveBeenCalledWith('/auth/register', {
      username: 'testuser',
      password: TEST_PW,
    })
  })

  it('login calls POST /auth/login', async () => {
    const { login } = await import('../../api/auth')
    await login('testuser', TEST_PW)
    expect(request.post).toHaveBeenCalledWith('/auth/login', {
      username: 'testuser',
      password: TEST_PW,
    })
  })

  it('changePassword calls POST /auth/change-password', async () => {
    const { changePassword } = await import('../../api/auth')
    await changePassword(OLD_PW, NEW_PW, NEW_PW)
    expect(request.post).toHaveBeenCalledWith('/auth/change-password', {
      current_password: OLD_PW,
      new_password: NEW_PW,
      confirm_password: NEW_PW,
    })
  })
})
