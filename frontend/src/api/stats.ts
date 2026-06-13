import request from './request'
import type { OverviewStats, YearlyStats, MonthlyStats, CityRank, CityMarker, TripRoute, MapStats, PhotoMapMarker } from '../types'

export function getOverview() {
  return request.get<OverviewStats>('/stats/overview')
}

export function getYearly() {
  return request.get<YearlyStats[]>('/stats/yearly')
}

export function getMonthly() {
  return request.get<MonthlyStats[]>('/stats/monthly')
}

export function getCityRank() {
  return request.get<CityRank[]>('/stats/city-rank')
}

export function getMapStats() {
  return request.get<MapStats>('/stats/map/stats')
}

export function getCityMarkers() {
  return request.get<CityMarker[]>('/stats/map/cities')
}

export function getTripRoute(tripId: number) {
  return request.get<TripRoute>(`/stats/map/route/${tripId}`)
}

export function getAllRoutes() {
  return request.get<TripRoute[]>('/stats/map/routes')
}

export function getPhotoMarkers() {
  return request.get<PhotoMapMarker[]>('/stats/map/photos')
}
