import request from './request'
import type { TimelineGroup } from '../types'

export function getTimeline() {
  return request.get<TimelineGroup[]>('/timeline')
}
