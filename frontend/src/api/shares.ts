import request from './request'
import type { ShareResponse, TripDetail } from '../types'

export function createShare(tripId: number) {
  return request.post<ShareResponse>(`/shares/${tripId}`)
}

export function viewShare(token: string) {
  return request.get<TripDetail>(`/shares/view/${token}`)
}
