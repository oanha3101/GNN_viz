import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSessionsPage from './AdminSessionsPage'

function jsonResponse(payload) {
  return {
    ok: true,
    headers: {
      get: () => 'application/json',
    },
    json: async () => payload,
  }
}

describe('AdminSessionsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 'sess-done',
            task_type: 2,
            model_type: 'GraphSAGE',
            dataset_name: 'PROTEINS',
            status: 'completed',
            last_epoch: 40,
            total_epochs: 40,
            started_at: '2026-05-20T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 12,
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: 'bulk_deleted',
        deleted: ['sess-done'],
        skipped_active: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [],
        total: 0,
        page: 1,
        page_size: 12,
      }))
  })

  it('deletes all non-active sessions from the admin page', async () => {
    render(<AdminSessionsPage />)

    await waitFor(() => {
      expect(screen.getByText('sess-done')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /delete all/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/sessions',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Delete all non-active sessions')
    )
  })
})
