import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminDatasetsPage from './AdminDatasetsPage'

function jsonResponse(payload) {
  return {
    ok: true,
    headers: {
      get: () => 'application/json',
    },
    json: async () => payload,
  }
}

describe('AdminDatasetsPage', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({
        dataset: {
          id: 5,
          name: 'Citations',
          slug: 'citations',
          description: 'Citation graph',
          is_public: true,
          current_version_id: 1,
          created_at: '2026-05-14T00:00:00Z',
        },
        version: {
          id: 1,
          version: 1,
          lifecycle: 'draft',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 5,
            name: 'Citations',
            slug: 'citations',
            description: 'Citation graph',
            is_public: true,
            current_version: {
              id: 1,
              version: 1,
              lifecycle: 'draft',
            },
            version_count: 1,
            usage_count: 0,
            created_at: '2026-05-14T00:00:00Z',
          },
        ],
      }))
  })

  it('creates a dataset from the admin page', async () => {
    render(<AdminDatasetsPage />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/datasets?page=1&page_size=12'),
        expect.any(Object)
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /create dataset/i }))
    fireEvent.change(screen.getByPlaceholderText('Dataset name'), {
      target: { value: 'Citations' },
    })
    fireEvent.change(screen.getByPlaceholderText('Dataset description'), {
      target: { value: 'Citation graph' },
    })
    fireEvent.click(screen.getByLabelText(/public/i))
    fireEvent.click(screen.getByRole('button', { name: /^create dataset$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/datasets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Citations',
            description: 'Citation graph',
            is_public: true,
          }),
        })
      )
    })
  })
})
