import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { searchAll } from '../../api/search'
import request from '../../api/request'

describe('Search API', () => {
  it('calls /search with query param', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: { trips: [], locations: [] } })
    await searchAll('test')
    expect(request.get).toHaveBeenCalledWith('/search', { params: { q: 'test' } })
  })
})
