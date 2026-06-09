import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminExperimentsPage from './AdminExperimentsPage'

describe('AdminExperimentsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({
          items: [
            {
              id: 11,
              title: 'Run Alpha',
              task_type: 1,
              model_type: 'GCN',
              dataset_name: 'cora',
              epoch_count: 20,
              best_epoch: 12,
              status: 'completed',
              retention_state: 'full',
              is_best: false,
              notes: 'before',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({
          status: 'bulk_deleted',
          deleted: [11],
          not_found: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json',
        },
        json: async () => ({
          items: [],
        }),
      })
  })

  it('bulk deletes selected experiments', async () => {
    render(<AdminExperimentsPage />)

    await waitFor(() => {
      expect(screen.getByText('Run Alpha')).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/experiments?page=1&page_size=12'),
      expect.any(Object)
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: /delete selected/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/experiments/bulk-delete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ experiment_ids: [11] }),
        })
      )
    })
  })
})
