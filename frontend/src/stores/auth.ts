import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login as loginApi, register as registerApi } from '../api/auth'
import router from '../router'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const isLoggedIn = ref(!!token.value)

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

  function logout() {
    token.value = ''
    localStorage.removeItem('token')
    isLoggedIn.value = false
    router.push('/login')
  }

  return { token, isLoggedIn, login, register, logout }
})
