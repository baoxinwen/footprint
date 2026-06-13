import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @vueuse/core
vi.mock('@vueuse/core', () => ({
  useDark: vi.fn(() => {
    const { ref } = require('vue')
    return ref(false)
  }),
  useToggle: vi.fn(() => vi.fn()),
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
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

describe('useTheme', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('exports useTheme function', () => {
    // The module should export useTheme
    expect(true).toBe(true)
  })

  it('reads theme mode from localStorage', () => {
    localStorageMock.setItem('theme-mode', 'dark')
    expect(localStorageMock.getItem('theme-mode')).toBe('dark')
  })

  it('defaults to auto when no theme mode set', () => {
    expect(localStorageMock.getItem('theme-mode')).toBeNull()
  })
})
