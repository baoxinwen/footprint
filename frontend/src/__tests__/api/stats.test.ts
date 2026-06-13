import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/request', () => ({
  default: {
    get: vi.fn(),
  },
}))

import { getPhotoMarkers, getMapStats, getCityMarkers, getAllRoutes } from '../../api/stats'
import request from '../../api/request'

describe('Stats API', () => {
  it('getPhotoMarkers calls /stats/map/photos', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [] })
    await getPhotoMarkers()
    expect(request.get).toHaveBeenCalledWith('/stats/map/photos')
  })

  it('getMapStats calls /stats/map/stats', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: {} })
    await getMapStats()
    expect(request.get).toHaveBeenCalledWith('/stats/map/stats')
  })

  it('getCityMarkers calls /stats/map/cities', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [] })
    await getCityMarkers()
    expect(request.get).toHaveBeenCalledWith('/stats/map/cities')
  })

  it('getAllRoutes calls /stats/map/routes', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [] })
    await getAllRoutes()
    expect(request.get).toHaveBeenCalledWith('/stats/map/routes')
  })
})
