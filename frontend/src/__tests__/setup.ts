import { vi } from 'vitest'

// Mock CSS imports
vi.mock('element-plus/dist/index.css', () => ({}))
vi.mock('element-plus/theme-chalk/base.css', () => ({}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver：observe 即同步回调 isIntersecting=true，
// 与"元素立即进入视口"语义一致，保证懒加载门控下的既有测试仍然立即加载图片
class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  observe: (target: Element) => void
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    const instance = this as unknown as IntersectionObserver
    this.observe = vi.fn((target: Element) => {
      this.callback(
        [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
        instance,
      )
    })
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// Mock URL.createObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock')
URL.revokeObjectURL = vi.fn()
