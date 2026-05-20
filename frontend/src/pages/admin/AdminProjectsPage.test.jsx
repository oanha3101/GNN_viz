import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminProjectsPage from './AdminProjectsPage'

function jsonResponse(payload) {
  return {
    ok: true,
    headers: {
      get: () => 'application/json',
    },
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

    fireEvent.click(screen.getByRole('button', { name: /create project/i }))
    fireEvent.change(screen.getByPlaceholderText('Project title'), {
      target: { value: 'Project One' },
    })
    fireEvent.change(screen.getByPlaceholderText('Project description'), {
      target: { value: 'Created from admin' },
    })
    fireEvent.change(screen.getByPlaceholderText('Task type'), {
      target: { value: '2' },
    })
    fireEvent.change(screen.getByPlaceholderText('Model type'), {
      target: { value: 'GAT' },
    })
    fireEvent.click(screen.getByLabelText(/public/i))
    fireEvent.click(screen.getByRole('button', { name: /^create project$/i }))

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
