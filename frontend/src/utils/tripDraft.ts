import { TOKEN_STORAGE_KEY } from './storageKeys'
import { decodeJwtPayload } from './jwt'

const LEGACY_TRIP_DRAFT_KEY = 'footprint:trip-draft'
const TRIP_DRAFT_KEY_PREFIX = `${LEGACY_TRIP_DRAFT_KEY}:`

function getTokenSubject(token: string): string | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  if (typeof payload.sub !== 'string' && typeof payload.sub !== 'number') return null
  const subject = String(payload.sub).trim()
  return subject || null
}

export function getTripDraftKey(token = localStorage.getItem(TOKEN_STORAGE_KEY) || ''): string {
  const subject = getTokenSubject(token)
  return `${TRIP_DRAFT_KEY_PREFIX}${encodeURIComponent(subject || 'anonymous')}`
}

export function discardLegacyTripDraft(): void {
  localStorage.removeItem(LEGACY_TRIP_DRAFT_KEY)
}

export function clearTripDrafts(): void {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  for (const key of keys) {
    if (key === LEGACY_TRIP_DRAFT_KEY || key?.startsWith(TRIP_DRAFT_KEY_PREFIX)) {
      localStorage.removeItem(key)
    }
  }
}
