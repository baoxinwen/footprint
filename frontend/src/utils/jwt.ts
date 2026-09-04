// JWT payload 的 base64url 解码：统一处理 -/_ 字符归一化与填充补齐。
// 此前路由守卫与 tripDraft 各自实现且行为不一致（守卫侧对 base64url
// 字符会抛 InvalidCharacterError，见评审 R3-3），现收敛为本实现。
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const encodedPayload = token.split('.')[1]
    if (!encodedPayload) return null
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(paddedPayload))
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}
