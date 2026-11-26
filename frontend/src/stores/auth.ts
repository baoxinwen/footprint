import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import { login as loginApi, register as registerApi } from '../api/auth'
import router from '../router'
import { AUTH_INVALIDATED_EVENT, invalidateAuthSession, markLogoutNavigation, clearLogoutNavigation } from '../utils/authSession'
import { clearPrivateCaches } from '../utils/pwa'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const isLoggedIn = ref(!!token.value)

  function applyLoggedOutState() {
    token.value = ''
    isLoggedIn.value = false
  }

  window.addEventListener(AUTH_INVALIDATED_EVENT, () => {
    applyLoggedOutState()
    // 别的标签页登出/换号后，本页不能停留在受保护页继续显示旧账号数据，
    // 立即跳登录页（评审 M-17）；分享页等匿名页面不受影响。
    // 本标签页自己登出时路由已在 /login 或即将跳转，此处的 replace 是幂等兜底
    if (!localStorage.getItem('token') && router.currentRoute.value.meta?.requiresAuth) {
      void router.replace('/login')
    }
  })
  onScopeDispose(() => window.removeEventListener(AUTH_INVALIDATED_EVENT, applyLoggedOutState))

  async function login(username: string, password: string) {
    const { data } = await loginApi(username, password)
    token.value = data.access_token
    localStorage.setItem('token', data.access_token)
    isLoggedIn.value = true
    // 登出时已清过一次离线缓存里的私人数据，但那一刻还没返回的请求可能在清理之后
    // 才把数据写回；登录时再清一次，确保这个账号看不到上一个账号留下的内容
    void clearPrivateCaches()
    router.push('/')
  }

  async function register(username: string, password: string) {
    await registerApi(username, password)
  }

  async function logout(): Promise<boolean> {
    // 标记"登出导航"让编辑页离开守卫放行，避免被未保存确认框劫持；
    // 导航被取消时保留会话并清除标记（恢复原契约）
    markLogoutNavigation()
    try {
      const navigationFailure = await router.replace('/login')
      if (navigationFailure) return false
      invalidateAuthSession()
      return true
    } finally {
      clearLogoutNavigation()
    }
  }

  return { token, isLoggedIn, login, register, logout }
})
