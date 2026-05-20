import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminProjectsPage from './AdminProjectsPage'

function jsonResponse(payload) {
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => payload,
  }
}

describe('AdminProjectsPage', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        id: 3,
        title: 'Project One',
        description: 'Created from admin',
        task_type: 2,
        model_type: 'GAT',
        is_public: true,
        owner_id: 1,
        created_at: '2026-05-14T00:00:00Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 3,
            title: 'Project One',
            description: 'Created from admin',
            task_type: 2,
            model_type: 'GAT',
            is_public: true,
            owner_id: 1,
            created_at: '2026-05-14T00:00:00Z',
            experiment_count: 0,
            session_count: 0,
          },
        ],
      }))
  })

  it('creates a project from the admin page', async () => {
    render(<AdminProjectsPage />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/projects?page=1&page_size=12'),
        expect.any(Object)
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    const dialog = screen.getByRole('complementary')
    fireEvent.change(within(dialog).getByLabelText(/^title/i), {
      target: { value: 'Project One' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^description$/i), {
      target: { value: 'Created from admin' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^task type$/i), {
      target: { value: '2' },
    })
    fireEvent.change(within(dialog).getByLabelText(/^model type$/i), {
      target: { value: 'GAT' },
    })
    fireEvent.click(within(dialog).getByLabelText(/public project/i))
    fireEvent.click(within(dialog).getByRole('button', { name: /^create project$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Project One',
            description: 'Created from admin',
            task_type: 2,
            model_type: 'GAT',
            is_public: true,
          }),
        })
      )
    })
  })
})
