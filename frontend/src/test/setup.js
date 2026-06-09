import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock ResizeObserver for JSDOM environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverMock

if (
  typeof window.localStorage === 'undefined' ||
  typeof window.localStorage.getItem !== 'function' ||
  typeof window.localStorage.setItem !== 'function' ||
  typeof window.localStorage.removeItem !== 'function' ||
  typeof window.localStorage.clear !== 'function'
) {
  const storage = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key) => storage.get(String(key)) ?? null),
      setItem: vi.fn((key, value) => storage.set(String(key), String(value))),
      removeItem: vi.fn((key) => storage.delete(String(key))),
      clear: vi.fn(() => storage.clear()),
    },
  })
}
