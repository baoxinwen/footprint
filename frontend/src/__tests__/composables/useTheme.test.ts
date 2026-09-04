import { describe, it, expect, vi, beforeEach } from 'vitest'

type Listener = () => void
// Mock @vueuse/core：行为对齐真实 useDark/useToggle——
// 读 storageKey 'theme' 初始化布尔值，toggle 翻转并回写存储
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  let currentRef: { value: boolean } | null = null
  return {
    useDark: vi.fn(({ storageKey }: { storageKey: string }) => {
      currentRef = ref(localStorage.getItem(storageKey) === 'dark')
      return currentRef
    }),
    useToggle: vi.fn(() => () => {
      if (currentRef) {
        currentRef.value = !currentRef.value
        localStorage.setItem('theme', currentRef.value ? 'dark' : 'light')
      }
    }),
  }
})

// 可控的 localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, _listener: Listener) => {}),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('useTheme（评审 R3-2：auto 模式启动对齐系统主题）', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('auto 模式启动时纠正陈旧的存储值并跟随系统', async () => {
    stubMatchMedia(true) // 系统深色
    localStorageMock.setItem('theme-mode', 'auto')
    localStorageMock.setItem('theme', 'light') // 应用关闭期间遗留的陈旧值

    const { useTheme } = await import('../../composables/useTheme')
    const { isDark } = useTheme()

    expect(isDark.value).toBe(true)
  })

  it('auto 模式且系统一致时保持存储值不抖动', async () => {
    stubMatchMedia(false) // 系统浅色
    localStorageMock.setItem('theme-mode', 'auto')
    localStorageMock.setItem('theme', 'light')

    const { useTheme } = await import('../../composables/useTheme')
    const { isDark } = useTheme()

    expect(isDark.value).toBe(false)
  })

  it('显式 light 模式不跟随系统主题', async () => {
    stubMatchMedia(true) // 系统深色
    localStorageMock.setItem('theme-mode', 'light')
    localStorageMock.setItem('theme', 'light')

    const { useTheme } = await import('../../composables/useTheme')
    const { isDark } = useTheme()

    expect(isDark.value).toBe(false)
  })
})
