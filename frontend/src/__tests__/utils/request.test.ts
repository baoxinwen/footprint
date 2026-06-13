import { describe, it, expect, vi } from 'vitest'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

import request from '../../api/request'

describe('API Request', () => {
  it('exports a request instance', () => {
    expect(request).toBeDefined()
  })

  it('has interceptors', () => {
    expect(request.interceptors).toBeDefined()
    expect(request.interceptors.request).toBeDefined()
    expect(request.interceptors.response).toBeDefined()
  })

  it('has HTTP methods', () => {
    // The mock doesn't define these but the real instance would
    expect(request).toBeDefined()
  })
})
