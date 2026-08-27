import request from './request'
import type { SearchResult } from '../types'

interface SearchOptions {
  signal?: AbortSignal
}

export function searchAll(q: string, options: SearchOptions = {}) {
  return request.get<SearchResult>('/search', { params: { q }, signal: options.signal })
}
