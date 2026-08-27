/** 站内路径 → 绝对 URL（兼容子路径部署）。 */
export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
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

/** 平滑滚动到指定元素（锚点导航共用）。 */
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
