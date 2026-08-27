import request from './request'
import type { Photo, ShareListItem, ShareResponse, TripDetail } from '../types'

export function getShares() {
  return request.get<ShareListItem[]>('/shares')
}

export function createShare(tripId: number) {
  return request.post<ShareResponse>(`/shares/${tripId}`)
}

export function viewShare(token: string) {
  return request.get<TripDetail>(`/shares/view/${encodeURIComponent(token)}`)
}

export function getSharedPhotos(token: string, locationId: number) {
  return request.get<Photo[]>(`/shares/view/${encodeURIComponent(token)}/locations/${locationId}/photos`)
}

export function rotateShare(tripId: number) {
  return request.post<ShareResponse>(`/shares/${tripId}/rotate`)
}

export function revokeShare(token: string) {
  return request.delete(`/shares/${encodeURIComponent(token)}`)
}
