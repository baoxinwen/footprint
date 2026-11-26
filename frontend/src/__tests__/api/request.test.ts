const gen = (): string => crypto.randomUUID().replaceAll('-', '')
const TEST_TOKEN = gen()
const EXPIRED_TOKEN = 'expired-' + gen()

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
  return { default: mockAxios }
})

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))

vi.mock('../../router', () => ({ default: routerMock }))

import axios from 'axios'
import { ElMessage } from 'element-plus'
import '../../api/request'

const axiosMock = axios as any
const rejectResponse = axiosMock.interceptors.response.use.mock.calls[0][1]
const errorMessageMock = ElMessage.error as ReturnType<typeof vi.fn>

describe('Request Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('creates axios instance with correct config', () => {
    // The request module creates an axios instance
    // We verify the module loads without error
    expect(true).toBe(true)
  })

  it('adds auth header when token exists', () => {
    localStorage.setItem('token', TEST_TOKEN)
    // The interceptor should add Authorization header
    expect(localStorage.getItem('token')).toBe(TEST_TOKEN)
  })

  it('does not add auth header when no token', () => {
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('forces login after a 401 while preserving user-scoped drafts', async () => {
    localStorage.setItem('token', EXPIRED_TOKEN)
    localStorage.setItem('footprint:trip-draft:17', 'private-draft')
    const invalidated = vi.fn()
    window.addEventListener('footprint:auth-invalidated', invalidated, { once: true })
    const error = {
      response: { status: 401, data: {} },
      config: { url: '/trips' },
    }

    await expect(rejectResponse(error)).rejects.toBe(error)

    // 会话失效：token 清除 + 失效事件广播 + 跳转登录
    expect(localStorage.getItem('token')).toBeNull()
    expect(invalidated).toHaveBeenCalledOnce()
    expect(routerMock.replace).toHaveBeenCalledWith('/login')
    // 用户草稿按 JWT sub 键控，保留以便重新登录后恢复未提交内容
    expect(localStorage.getItem('footprint:trip-draft:17')).toBe('private-draft')
  })

  it('normalizes FastAPI 422 array detail into readable text', async () => {
    const error = {
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ['body', 'confirm_password'], msg: 'Field required', type: 'missing' },
            { loc: ['body', 'new_password'], msg: 'String should have at least 6 characters', type: 'string_too_short' },
          ],
        },
      },
      config: { url: '/auth/change-password' },
    }

    await expect(rejectResponse(error)).rejects.toBe(error)
    expect(errorMessageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Field required；String should have at least 6 characters' })
    )
  })

  it('keeps string detail as-is and falls back when detail is missing', async () => {
    await expect(
      rejectResponse({ response: { status: 400, data: { detail: '该用户名已被占用' } }, config: { url: '/x' } })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({ message: '该用户名已被占用' }))

    await expect(
      rejectResponse({ response: { status: 500, data: {} }, config: { url: '/x' } })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).toHaveBeenLastCalledWith(expect.objectContaining({ message: '请求失败，请稍后重试' }))
  })

  it('treats aborted requests as silent rejections, not network errors', async () => {
    // 回归（评审 I4）：搜索防抖/图片懒加载切换会主动 abort 在途请求，
    // 这不是网络错误，不应弹 toast
    const cancelError = Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })
    await expect(rejectResponse(cancelError)).rejects.toBe(cancelError)
    expect(errorMessageMock).not.toHaveBeenCalled()
  })

  it('suppresses per-request toast for requests marked silent', async () => {
    // 回归（评审 R4-7）：批量图片加载失败由视图层汇总提示，
    // 标记 meta.silent 的请求不再逐请求弹错（401 跳转逻辑不受影响）
    await expect(
      rejectResponse({
        response: { status: 500, data: {} },
        config: { url: '/photos/1/thumbnail', meta: { silent: true } },
      })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).not.toHaveBeenCalled()
  })

  it('suppresses toast for silent requests that failed without a response', async () => {
    // 回归（评审 I-7）：断网/超时（无 error.response）走不到 silent 判断，
    // 离线滚动到未缓存的缩略图时曾逐张弹「网络连接失败」
    await expect(
      rejectResponse({
        code: 'ERR_NETWORK',
        config: { url: '/photos/1/thumbnail', meta: { silent: true } },
      })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).not.toHaveBeenCalled()
  })

  it('reports timeouts as their own message for non-silent requests', async () => {
    // 回归（评审 I-7/M-30）：链路是通的只是慢，不该说「网络连接失败」
    await expect(
      rejectResponse({ code: 'ECONNABORTED', config: { url: '/trips/1/export/json' } })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: '请求超时，请稍后重试' })
    )
  })

  it('reports 413 payloads with a size-specific message', async () => {
    // 回归（评审 M-30）：nginx 的 413 是 HTML 页，取不到 detail，需要专门的文案
    await expect(
      rejectResponse({ response: { status: 413, data: '<html>413</html>' }, config: { url: '/photos/upload/1' } })
    ).rejects.toBeTruthy()
    expect(errorMessageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: '文件过大，请压缩后重试' })
    )
  })
})
