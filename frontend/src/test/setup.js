import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock ResizeObserver for JSDOM environment
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverMock
