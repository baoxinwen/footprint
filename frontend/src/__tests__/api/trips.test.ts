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

describe('trips API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getTrips calls GET /trips with params', async () => {
    const { getTrips } = await import('../../api/trips')
    await getTrips({ page: 1, page_size: 20, sort_by: 'date', order: 'desc' })
    expect(request.get).toHaveBeenCalledWith('/trips', {
      params: { page: 1, page_size: 20, sort_by: 'date', order: 'desc' },
    })
  })

  it('getTripCities calls GET /trips/cities', async () => {
    const { getTripCities } = await import('../../api/trips')
    await getTripCities()
    expect(request.get).toHaveBeenCalledWith('/trips/cities')
  })

  it('getTripYears calls GET /trips/years', async () => {
    const { getTripYears } = await import('../../api/trips')
    await getTripYears()
    expect(request.get).toHaveBeenCalledWith('/trips/years')
  })

  it('getTrip calls GET /trips/:id', async () => {
    const { getTrip } = await import('../../api/trips')
    await getTrip(42)
    expect(request.get).toHaveBeenCalledWith('/trips/42')
  })

  it('createTrip calls POST /trips', async () => {
    const { createTrip } = await import('../../api/trips')
    const data = { title: '测试', start_date: '2025-01-01', end_date: '2025-01-03' }
    await createTrip(data)
    expect(request.post).toHaveBeenCalledWith('/trips', data)
  })

  it('updateTrip calls PUT /trips/:id', async () => {
    const { updateTrip } = await import('../../api/trips')
    await updateTrip(1, { title: '新标题' })
    expect(request.put).toHaveBeenCalledWith('/trips/1', { title: '新标题' })
  })

  it('deleteTrip calls DELETE /trips/:id', async () => {
    const { deleteTrip } = await import('../../api/trips')
    await deleteTrip(1)
    expect(request.delete).toHaveBeenCalledWith('/trips/1')
  })

  it('addLocation calls POST /trips/:id/locations', async () => {
    const { addLocation } = await import('../../api/trips')
    const loc = { name: '故宫', longitude: 116.397, latitude: 39.916 }
    await addLocation(1, loc)
    expect(request.post).toHaveBeenCalledWith('/trips/1/locations', loc)
  })

  it('updateLocation calls PUT /trips/:id/locations/:id', async () => {
    const { updateLocation } = await import('../../api/trips')
    await updateLocation(1, 2, { name: '新名称' })
    expect(request.put).toHaveBeenCalledWith('/trips/1/locations/2', { name: '新名称' })
  })

  it('deleteLocation calls DELETE /trips/:id/locations/:id', async () => {
    const { deleteLocation } = await import('../../api/trips')
    await deleteLocation(1, 2)
    expect(request.delete).toHaveBeenCalledWith('/trips/1/locations/2')
  })

  it('updateSortOrder calls PUT /trips/:id/locations/sort', async () => {
    const { updateSortOrder } = await import('../../api/trips')
    const orders = [{ location_id: 1, sort_order: 0 }, { location_id: 2, sort_order: 1 }]
    await updateSortOrder(1, orders)
    expect(request.put).toHaveBeenCalledWith('/trips/1/locations/sort', orders)
  })
})
