import request from './request'
import type { AmapPoi } from '../types'

export function searchPoi(keywords: string, city?: string) {
  return request.get<AmapPoi[]>('/amap/poi/search', {
    params: { keywords, city: city || '' },
  })
}
