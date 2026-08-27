import { clearTripDrafts, discardLegacyTripDraft } from './tripDraft'
import { TOKEN_STORAGE_KEY } from './storageKeys'

export { TOKEN_STORAGE_KEY }

export const AUTH_INVALIDATED_EVENT = 'footprint:auth-invalidated'

// 跨标签页会话同步：其他标签页登出（storage 事件仅在别的窗口触发）
// 时，本页同步派发失效事件，让 Pinia store 等监听者立即重置登录态，
// 不必等到下一次请求收到 401 才自愈。草稿由执行登出的标签页统一清除。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_STORAGE_KEY && event.newValue === null) {
      window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT))
    }
  })
}

export function invalidateAuthSession(options: { clearDrafts?: boolean } = {}): void {
  // 默认清空全部用户草稿（登出语义）；401 过期路径传 false——
  // 草稿按用户 sub 键控，保留后重新登录即可恢复未提交内容，
  // 仅清除无属主的 legacy 草稿以防串号
  if (options.clearDrafts === false) {
    discardLegacyTripDraft()
  } else {
    clearTripDrafts()
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT))
}

// 登出导航进行中的标记：编辑页路由离开守卫据此识别"登出"并放行，
// 避免被"未保存的修改"确认框劫持；导航取消时由调用方清除标记
let logoutNavigationInFlight = false

export function markLogoutNavigation(): void {
  logoutNavigationInFlight = true
}

export function clearLogoutNavigation(): void {
  logoutNavigationInFlight = false
}

export function isLogoutNavigation(): boolean {
  return logoutNavigationInFlight
}
