import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'
import { invalidateAuthSession } from '../utils/authSession'
import { TOKEN_STORAGE_KEY } from '../utils/storageKeys'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// FastAPI 校验错误（422）的 detail 是数组，需要归一化为可读文本
function extractDetail(data: unknown): string | null {
  const detail = (data as { detail?: unknown } | null | undefined)?.detail
  if (typeof detail === 'string' && detail) {
    return detail
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : ''
      )
      .filter(Boolean)
    if (messages.length) {
      return messages.join('；')
    }
    return null
  }
  if (detail && typeof detail === 'object' && 'msg' in detail) {
    return String((detail as { msg: unknown }).msg)
  }
  return null
}

// 401 处理一次性闸：token 过期时页面上的批量图片请求会同时收到 401，
// 避免重复 toast 与多次跳转
let authRedirectInProgress = false

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      if (status === 401) {
        // Don't redirect on login failures
        const alreadyOnLogin = router.currentRoute?.value?.path === '/login'
        if (!error.config?.url?.includes('/auth/login') && !authRedirectInProgress && !alreadyOnLogin) {
          authRedirectInProgress = true
          // 只清 token 不清用户草稿：草稿按 JWT sub 键控，
          // 重新登录后未提交内容仍可恢复，避免编辑页被静默踢出时双重丢失
          invalidateAuthSession({ clearDrafts: false })
          void Promise.resolve(router.replace('/login')).finally(() => {
            authRedirectInProgress = false
          })
          ElMessage.error('登录已过期，请重新登录')
        }
      } else if (status === 429) {
        ElMessage.error(extractDetail(data) ?? '操作过于频繁，请稍后再试')
      } else {
        ElMessage.error(extractDetail(data) ?? '请求失败')
      }
    } else {
      ElMessage.error('网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
