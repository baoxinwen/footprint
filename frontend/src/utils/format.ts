export function formatDateRange(start: string, end: string): string {
  return `${start} ~ ${end}`
}

export function formatDateCN(dateStr: string): string {
  const date = new Date(dateStr)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}年${m}月${d}日`
}

/**
 * 旅行天数（含首尾两天）。日期非法或结束早于开始时返回 null，
 * 调用方应展示占位符而不是把 NaN 渲染给用户。
 */
export function durationDays(start: string, end: string): number | null {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.ceil(ms / 86400000) + 1
}

/** 封面兜底字符：优先城市首字，其次标题首字。 */
export function coverFallbackText(cities: string[] | undefined, title: string): string {
  return cities?.[0]?.slice(0, 1) || title.slice(0, 1)
}
