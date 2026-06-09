import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from './LandingPage'

beforeAll(() => {
  global.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

vi.mock('../../store/authStore', () => {
  const useAuthStore = (selector) => selector({ user: null })
  return { default: useAuthStore }
})

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key) => key,
  }),
}))

describe('LandingPage', () => {
  it('renders landing page without crashing', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    )
    expect(screen.getAllByText('landing.get_started_free')[0]).toBeInTheDocument()
  })
})
