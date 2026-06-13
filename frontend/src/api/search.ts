import request from './request'
import type { SearchResult } from '../types'

export function searchAll(q: string) {
  return request.get<SearchResult>('/search', { params: { q } })
}
