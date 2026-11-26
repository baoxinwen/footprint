/** 站内路径 → 绝对 URL（兼容子路径部署）。 */
export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

/** 从 Content-Disposition 解析下载文件名；解析不出返回 null（评审 M-26）。 */
export function attachmentFilename(header: string | undefined | null): string | null {
  if (!header) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      // 编码异常时落到下面的普通形式
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}

/** 触发浏览器下载一个 Blob，自动释放 objectURL。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 平滑滚动到指定元素（锚点导航共用）；reduced-motion 用户直接跳转（CSS 降级管不到 JS 滚动）。 */
export function scrollToSection(id: string): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}
