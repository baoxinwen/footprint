import { describe, it, expect } from 'vitest'
import { attachmentFilename } from '../../utils/dom'

describe('attachmentFilename（评审 M-26）', () => {
  it('parses RFC 5987 filename* with percent-encoding', () => {
    expect(
      attachmentFilename("attachment; filename*=UTF-8''%E5%8C%97%E4%BA%AC%E4%B8%89%E6%97%A5%E6%B8%B8.zip")
    ).toBe('北京三日游.zip')
  })

  it('falls back to the plain filename form', () => {
    expect(attachmentFilename('attachment; filename="trip.zip"')).toBe('trip.zip')
    expect(attachmentFilename('attachment; filename=trip.zip')).toBe('trip.zip')
  })

  it('returns null for missing or malformed headers', () => {
    expect(attachmentFilename(undefined)).toBeNull()
    expect(attachmentFilename('')).toBeNull()
    expect(attachmentFilename('attachment')).toBeNull()
  })
})
