import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectsPage from './ProjectsPage'

const { setActiveProjectContext } = vi.hoisted(() => ({
  setActiveProjectContext: vi.fn(),
}))

vi.mock('../../store/useGNNStore', () => {
  const state = {
    activeProjectId: null,
    setActiveProjectContext,
  }
  const useGNNStore = (selector) => selector(state)
  return { default: useGNNStore }
})

describe('ProjectsPage', () => {
  beforeEach(() => {
    setActiveProjectContext.mockReset()
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: 7, title: 'Graph Bench', description: 'Main research stream', owner_id: 3, is_public: false },
      ],
    }))
  })

  it('loads projects and lets the user select active context', async () => {
    render(<ProjectsPage />)

    await waitFor(() => {
      expect(screen.getByText('Graph Bench')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /select/i }))
    expect(setActiveProjectContext).toHaveBeenCalledWith(7, 'Graph Bench')
  })
})
