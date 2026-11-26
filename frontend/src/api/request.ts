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
    // 主动取消（搜索防抖、图片懒加载切换等 abort）不是错误：
    // 静默透传，避免虚假的「网络错误」toast
    if (error?.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }
    if (error.response) {
      const { status, data } = error.response
      // meta.silent：批量图片等场景由视图层汇总错误，不逐请求弹 toast；
      // 401 的会话失效跳转不受其影响
      const silent = error.config?.meta?.silent === true
      const toastOptions = { grouping: true } as const
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
          ElMessage.error({ message: '登录已过期，请重新登录', ...toastOptions })
        }
      } else if (status === 413) {
        // nginx 的 413 响应是 HTML 页，取不到后端的具体文案（评审 M-30）
        if (!silent) ElMessage.error({ message: '文件过大，请压缩后重试', ...toastOptions })
      } else if (status === 429) {
        if (!silent) ElMessage.error({ message: extractDetail(data) ?? '操作过于频繁，请稍后再试', ...toastOptions })
      } else {
        if (!silent) ElMessage.error({ message: extractDetail(data) ?? '请求失败，请稍后重试', ...toastOptions })
      }
    } else {
      // 无响应失败（断网/超时）同样尊重 silent（评审 I-7）；
      // 超时链路是通的，给单独文案，不冒充网络错误
      const silent = error.config?.meta?.silent === true
      if (!silent) {
        const message =
          error?.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '网络连接失败，请检查网络后重试'
        ElMessage.error({ message, grouping: true })
      }
    }
    return Promise.reject(error)
  }
)

export default request
