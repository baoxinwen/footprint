import { TOKEN_STORAGE_KEY } from './storageKeys'

const LEGACY_TRIP_DRAFT_KEY = 'footprint:trip-draft'
const TRIP_DRAFT_KEY_PREFIX = `${LEGACY_TRIP_DRAFT_KEY}:`

function getTokenSubject(token: string): string | null {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(paddedPayload)) as { sub?: unknown }
    if (typeof payload.sub !== 'string' && typeof payload.sub !== 'number') return null
    const subject = String(payload.sub).trim()
    return subject || null
  } catch {
    return null
  }
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
