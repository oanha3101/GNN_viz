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
    global.fetch = vi.fn(async (input) => {
      const url = String(input)
      if (url.includes('/projects?')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => [
            { id: 7, title: 'Graph Bench', description: 'Main research stream', owner_id: 3, is_public: false, updated_at: '2026-06-08T03:00:00.000Z' },
          ],
        }
      }
      if (url.includes('/experiments?')) {
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ({
            items: [
              {
                id: 91,
                project_id: 7,
                task_type: 4,
                model_type: 'GCN',
                dataset_name: 'Cora',
                created_at: '2026-06-08T02:00:00.000Z',
              },
            ],
          }),
        }
      }
      throw new Error(`Unhandled fetch: ${url}`)
    })
  })

  it('loads projects with richer context and lets the user select active context', async () => {
    render(<ProjectsPage />)

    await waitFor(() => {
      expect(screen.getByText('Graph Bench')).toBeInTheDocument()
    })

    expect(screen.getByText('1 thí nghiệm')).toBeInTheDocument()
    expect(screen.getByText('Phát hiện cộng đồng')).toBeInTheDocument()
    expect(screen.getByText('GCN')).toBeInTheDocument()
    expect(screen.getByText('Cora')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^chọn$/i }))
    expect(setActiveProjectContext).toHaveBeenCalledWith(7, 'Graph Bench')
  })
})
