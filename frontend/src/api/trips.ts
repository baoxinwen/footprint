import request from './request'
import type { TripListResponse, TripDetail, Location } from '../types'

export function getTrips(params: {
  sort_by?: string
  order?: string
  search?: string
  year?: number
  month?: number
  city?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}) {
  return request.get<TripListResponse>('/trips', { params })
}

export function getTripCities() {
  return request.get<string[]>('/trips/cities')
}

export function getTripYears() {
  return request.get<number[]>('/trips/years')
}

export function getTrip(id: number) {
  return request.get<TripDetail>(`/trips/${id}`)
}

export function createTrip(data: {
  title: string
  description?: string
  start_date: string
  end_date: string
  locations?: Partial<Location>[]
}) {
  return request.post('/trips', data)
}

export function updateTrip(id: number, data: {
  title?: string
  description?: string
  start_date?: string
  end_date?: string
}) {
  return request.put(`/trips/${id}`, data)
}

export function deleteTrip(id: number) {
  return request.delete(`/trips/${id}`)
}

export function addLocation(tripId: number, data: Partial<Location>) {
  return request.post<Location>(`/trips/${tripId}/locations`, data)
}

export function updateLocation(tripId: number, locationId: number, data: Partial<Location>) {
  return request.put<Location>(`/trips/${tripId}/locations/${locationId}`, data)
}

export function deleteLocation(tripId: number, locationId: number) {
  return request.delete(`/trips/${tripId}/locations/${locationId}`)
}

export function updateSortOrder(tripId: number, orders: { location_id: number; sort_order: number }[]) {
  return request.put(`/trips/${tripId}/locations/sort`, orders)
}
