import { describe, it, expect } from 'vitest'
import { decodeJwtPayload } from '../../utils/jwt'

function encodeBase64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('decodeJwtPayload', () => {
  it('decodes a standard HS256 token payload', () => {
    const token = `header.${encodeBase64Url({ sub: '17', exp: 123 })}.signature`
    expect(decodeJwtPayload(token)).toEqual({ sub: '17', exp: 123 })
  })

  it('decodes payloads whose base64url encoding contains - and _', () => {
    // 构造编码后含 -/_ 的 payload（评审 R3-3：守卫侧旧实现会抛 InvalidCharacterError）。
    // 末组两字节 0xFF 0xFC 使 base64 末组第三字符必为 '/'，url 化后为 '-'
    const raw = '{"sub":"xxx\u00ff\u00fc"}'
    const withSpecial = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(withSpecial).toMatch(/[-_]/)
    expect(decodeJwtPayload(`h.${withSpecial}.s`)).toEqual(JSON.parse(raw))
  })

  it('returns null for malformed tokens instead of throwing', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('h.%%%invalid%%%.s')).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
  })

  it('returns null when payload is not an object', () => {
    const scalar = btoa('12345').replace(/=+$/, '')
    expect(decodeJwtPayload(`h.${scalar}.s`)).toBeNull()
  })
})
