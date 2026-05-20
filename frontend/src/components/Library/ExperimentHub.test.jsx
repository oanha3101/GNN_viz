import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExperimentHub from './ExperimentHub'

const gnnState = {
  setTask: vi.fn(),
  setHyperparams: vi.fn(),
  setGraphData: vi.fn(),
  setGroundTruth: vi.fn(),
  setTaskData: vi.fn(),
  setMockMode: vi.fn(),
  setActiveProjectContext: vi.fn(),
  setActiveDatasetContext: vi.fn(),
}

const playerState = {
  loadSnapshots: vi.fn(),
  setDone: vi.fn(),
}

const authState = {
  getAuthHeaders: vi.fn(() => ({})),
}

vi.mock('../../store/useGNNStore', () => {
  const store = (selector) => selector(gnnState)
  store.getState = () => gnnState
  store.setState = vi.fn()
  return { default: store }
})

vi.mock('../../store/playerStore', () => {
  const store = (selector) => selector(playerState)
  return { default: store }
})

vi.mock('../../store/authStore', () => {
  const store = (selector) => selector(authState)
  return { default: store }
})

describe('ExperimentHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async (input, options = {}) => {
      const url = String(input)

      if (url.endsWith('/api/experiments')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 1,
                title: 'Alpha Run',
                project_id: 7,
                owner_id: 3,
                dataset_id: 21,
                dataset_version_id: 31,
                task_type: 1,
                model_type: 'GCN',
                dataset_name: 'cora',
                epoch_count: 4,
                accuracy: 0.91,
                loss: 0.11,
                best_epoch: 3,
                status: 'completed',
                is_best: false,
                is_mock: false,
                retention_state: 'full',
                created_at: '2026-05-05T00:00:00Z',
                notes: '',
              },
              {
                id: 2,
                title: 'Beta Run',
                project_id: 8,
                owner_id: 4,
                dataset_id: 22,
                dataset_version_id: 32,
                task_type: 1,
                model_type: 'GAT',
                dataset_name: 'citeseer',
                epoch_count: 3,
                accuracy: 0.84,
                loss: 0.2,
                best_epoch: 2,
                status: 'completed',
                is_best: true,
                is_mock: false,
                retention_state: 'full',
                created_at: '2026-05-05T00:00:00Z',
                notes: 'baseline',
              },
            ],
            total: 2,
            page: 1,
            page_size: 2,
          }),
        }
      }

      if (url.endsWith('/api/projects')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 7, title: 'Project A' }, { id: 8, title: 'Project B' }] }),
        }
      }

      if (url.endsWith('/api/datasets')) {
        return {
          ok: true,
          json: async () => ({ items: [{ id: 21, name: 'Cora', current_version_id: 31 }, { id: 22, name: 'Citeseer', current_version_id: 32 }] }),
        }
      }

      if (url.endsWith('/api/experiments/1') && options.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            title: 'Alpha Production Run',
            notes: 'ready for publish',
            is_best: true,
          }),
        }
      }

      if (url.endsWith('/api/experiments/1')) {
        return {
          ok: true,
          json: async () => ({
            id: 1,
            title: 'Alpha Run',
            project_id: 7,
            dataset_id: 21,
            dataset_version_id: 31,
            task_type: 1,
            model_type: 'GCN',
            dataset_name: 'cora',
            epoch_count: 4,
            learning_rate: 0.01,
            hidden_dim: 64,
            dropout: 0.5,
            accuracy: 0.91,
            loss: 0.11,
            best_epoch: 3,
            status: 'completed',
            is_best: false,
            retention_state: 'full',
            created_at: '2026-05-05T00:00:00Z',
            notes: '',
          }),
        }
      }

      if (url.endsWith('/api/experiments/1/report')) {
        return {
          ok: true,
          json: async () => ({
            experiment: { id: 1, dataset_name: 'cora' },
            summary: { best_epoch: 3, best_score: 0.91 },
            replay: { api_path: '/api/experiments/1/replay?epoch=3' },
            dataset_version: { version: 1, lifecycle: 'published' },
            config: { epochs: 4 },
            next_action: 'compare',
            notes: '',
          }),
        }
      }

      if (url.endsWith('/api/experiments/1/report?track_export=true')) {
        return {
          ok: true,
          json: async () => ({
            experiment: { id: 1, dataset_name: 'cora' },
            summary: { best_epoch: 3, best_score: 0.91 },
            replay: { api_path: '/api/experiments/1/replay?epoch=3' },
            dataset_version: { version: 1, lifecycle: 'published' },
            config: { epochs: 4 },
            next_action: 'compare',
            notes: '',
          }),
        }
      }

      if (url.endsWith('/api/experiments/2')) {
        return {
          ok: true,
          json: async () => ({
            id: 2,
            title: 'Beta Run',
            project_id: 8,
            dataset_id: 22,
            dataset_version_id: 32,
            task_type: 1,
            model_type: 'GAT',
            dataset_name: 'citeseer',
            epoch_count: 3,
            learning_rate: 0.01,
            hidden_dim: 64,
            dropout: 0.5,
            accuracy: 0.84,
            loss: 0.2,
            best_epoch: 2,
            status: 'completed',
            is_best: true,
            retention_state: 'full',
            created_at: '2026-05-05T00:00:00Z',
            notes: 'baseline',
          }),
        }
      }

      if (url.endsWith('/api/experiments/2/report')) {
        return {
          ok: true,
          json: async () => ({
            experiment: { id: 2, dataset_name: 'citeseer' },
            summary: { best_epoch: 2, best_score: 0.84 },
            replay: { api_path: '/api/experiments/2/replay?epoch=2' },
            dataset_version: { version: 1, lifecycle: 'published' },
            config: { epochs: 3 },
            next_action: 'compare',
            notes: 'baseline',
          }),
        }
      }

      throw new Error(`Unhandled fetch for ${url}`)
    })
  })

  it('renders page mode and saves edited title with notes', async () => {
    render(<ExperimentHub isOpen variant="page" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Alpha Run')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/record hypotheses/i)).toBeInTheDocument()
    })

    const titleInput = screen.getByDisplayValue('Alpha Run')
    fireEvent.change(titleInput, { target: { value: 'Alpha Production Run' } })

    const notesInput = screen.getByPlaceholderText(/record hypotheses/i)
    fireEvent.change(notesInput, { target: { value: 'ready for publish' } })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/experiments/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            title: 'Alpha Production Run',
            notes: 'ready for publish',
            is_best: false,
          }),
        }),
      )
    })
  })

  it('filters visible runs through local search', async () => {
    render(<ExperimentHub isOpen variant="page" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Alpha Run')).toBeInTheDocument()
      expect(screen.getByText('Beta Run')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/search by title/i), {
      target: { value: 'beta' },
    })

    await waitFor(() => {
      expect(screen.queryByText('Alpha Run')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Beta Run')).toBeInTheDocument()
  })
})
