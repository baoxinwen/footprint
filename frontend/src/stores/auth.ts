import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import { login as loginApi, register as registerApi } from '../api/auth'
import router from '../router'
import { AUTH_INVALIDATED_EVENT, invalidateAuthSession, markLogoutNavigation, clearLogoutNavigation } from '../utils/authSession'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const isLoggedIn = ref(!!token.value)

  function applyLoggedOutState() {
    token.value = ''
    isLoggedIn.value = false
  }

  window.addEventListener(AUTH_INVALIDATED_EVENT, applyLoggedOutState)
  onScopeDispose(() => window.removeEventListener(AUTH_INVALIDATED_EVENT, applyLoggedOutState))

  async function login(username: string, password: string) {
    const { data } = await loginApi(username, password)
    token.value = data.access_token
    localStorage.setItem('token', data.access_token)
    isLoggedIn.value = true
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
