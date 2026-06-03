import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrainingControlsV2 from './TrainingControlsV2'

const gnnState = {
  isTraining: true,
  trainingProgress: 0.5,
  mockMode: false,
  hyperparams: { epochs: 10, lr: 0.01, hidden: 64, dataset: 'cora' },
  selectedTask: 1,
  selectedModel: 'GCN',
  activeProjectId: 11,
  activeDatasetVersionId: 22,
  uploadedFilePath: 'datasets/runtime/test-graph.pt',
  taskConfig: null,
  uploadMetadata: null,
  setTraining: vi.fn(),
  setGraphData: vi.fn(),
  setGroundTruth: vi.fn(),
  setTrainMask: vi.fn(),
  setTaskData: vi.fn(),
  setReportOpen: vi.fn(),
}

const playerState = {
  snapshots: [],
  loadSnapshots: vi.fn(),
  addSnapshot: vi.fn(),
  setDone: vi.fn(),
  resetForTraining: vi.fn(),
  trainingDone: false,
  reportVersion: 0,
}

const sessionState = {
  sessionId: 'sess-123',
  createSession: vi.fn(),
  setStatus: vi.fn(),
}

const authState = {
  user: { id: 1, role: 'researcher', username: 'researcher' },
  token: 'token-123',
}

vi.mock('../store/useGNNStore', () => {
  const store = (selector) => selector(gnnState)
  store.getState = () => gnnState
  store.setState = (patch) => Object.assign(gnnState, patch)
  return { default: store }
})

vi.mock('../store/playerStore', () => {
  const store = (selector) => selector(playerState)
  store.getState = () => playerState
  return { default: store }
})

vi.mock('../store/sessionStore', () => {
  const store = (selector) => selector(sessionState)
  store.getState = () => sessionState
  return { default: store }
})

vi.mock('../store/authStore', () => {
  const store = (selector) => selector(authState)
  store.getState = () => authState
  return { default: store }
})

describe('TrainingControlsV2', () => {
  beforeEach(() => {
    gnnState.isTraining = true
    gnnState.mockMode = false
    gnnState.trainingProgress = 0.5
    gnnState.selectedTask = 1
    gnnState.selectedModel = 'GCN'
    gnnState.hyperparams = { epochs: 10, lr: 0.01, hidden: 64, dataset: 'cora' }
    gnnState.uploadedFilePath = 'datasets/runtime/test-graph.pt'
    gnnState.taskConfig = null
    sessionState.sessionId = 'sess-123'
    sessionState.createSession = vi.fn()
    sessionState.setStatus = vi.fn()
    gnnState.setTraining = vi.fn((isTraining, progress) => {
      gnnState.isTraining = isTraining
      gnnState.trainingProgress = progress
    })
    gnnState.setReportOpen = vi.fn()
    playerState.resetForTraining = vi.fn()
    playerState.loadSnapshots = vi.fn()
    playerState.addSnapshot = vi.fn()
    playerState.setDone = vi.fn()
    playerState.trainingDone = false
    playerState.reportVersion = 0
    playerState.snapshots = []
    authState.user = { id: 1, role: 'researcher', username: 'researcher' }
    authState.token = 'token-123'
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'stopped', session_id: 'sess-123' }),
      }),
    )
  })

  it('stops live training through the session-scoped endpoint', async () => {
    render(<TrainingControlsV2 />)

    fireEvent.click(screen.getByRole('button', { name: /dừng huấn luyện/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sessions/sess-123/stop',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(sessionState.setStatus).toHaveBeenCalledWith('stopped')
    expect(gnnState.setTraining).toHaveBeenCalledWith(false, 0.5)
  })

  it('stops mock training locally without hitting the backend', async () => {
    gnnState.mockMode = true

    render(<TrainingControlsV2 />)

    fireEvent.click(screen.getByRole('button', { name: /dừng huấn luyện/i }))

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled()
    })
    expect(sessionState.setStatus).toHaveBeenCalledWith('stopped')
    expect(gnnState.setTraining).toHaveBeenCalledWith(false, 0.5)
  })

  it('streams mock snapshots over time instead of loading the final result immediately', async () => {
    vi.useFakeTimers()
    try {
      gnnState.isTraining = false
      gnnState.mockMode = true
      gnnState.selectedTask = 1
      gnnState.hyperparams = { epochs: 5, lr: 0.01, hidden: 64, dataset: 'cora' }

      render(<TrainingControlsV2 />)
      window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

      expect(playerState.resetForTraining).toHaveBeenCalled()
      expect(gnnState.setGraphData).toHaveBeenCalled()
      expect(gnnState.setTraining).toHaveBeenCalledWith(true, 0)
      expect(playerState.loadSnapshots).not.toHaveBeenCalled()
      expect(playerState.addSnapshot).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(80)
      expect(playerState.addSnapshot).toHaveBeenCalledTimes(1)
      expect(gnnState.setTraining).toHaveBeenLastCalledWith(true, 0.2)
      expect(playerState.setDone).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(400)

      expect(playerState.addSnapshot).toHaveBeenCalledTimes(5)
      expect(playerState.setDone).toHaveBeenCalledWith(4)
      expect(gnnState.setTraining).toHaveBeenLastCalledWith(false, 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not dispatch live training when session creation fails', async () => {
    gnnState.isTraining = false
    sessionState.createSession = vi.fn().mockRejectedValue(new Error('403'))
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)

    // Start training is now triggered via the global event (dispatched by the red player button / Space key).
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gnn:start-training' }))
    expect(gnnState.setTraining).toHaveBeenCalledWith(false, 0)
    expect(playerState.resetForTraining).not.toHaveBeenCalled()
  })

  it('lets a completed run start again without reloading the page', async () => {
    gnnState.isTraining = false
    gnnState.selectedTask = 4
    playerState.trainingDone = true
    playerState.reportVersion = 2
    playerState.snapshots = [{ epoch: 0 }, { epoch: 1 }]
    sessionState.createSession = vi.fn().mockResolvedValue({ session_id: 'sess-rerun' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)

    fireEvent.click(screen.getByTestId('footer-run-again'))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })

    expect(playerState.resetForTraining).toHaveBeenCalled()
    expect(gnnState.setReportOpen).toHaveBeenCalledWith(false)
    expect(gnnState.setTraining).toHaveBeenCalledWith(true, 0)

    const startEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .find((event) => event?.type === 'gnn:start-training')

    expect(startEvent?.detail).toEqual(expect.objectContaining({
      task: 4,
      session_id: 'sess-rerun',
    }))
  })

  it('ignores start-training event for viewer accounts', async () => {
    gnnState.isTraining = false
    authState.user = { id: 2, role: 'viewer', username: 'viewer' }

    render(<TrainingControlsV2 />)
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

    // Viewers must not be able to kick off training even via the event API.
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionState.createSession).not.toHaveBeenCalled()
    expect(gnnState.setTraining).not.toHaveBeenCalled()
  })

  it('dispatches the GAT Task 2 recall-rescue recipe for live training', async () => {
    gnnState.isTraining = false
    gnnState.selectedTask = 2
    gnnState.selectedModel = 'GAT'
    gnnState.hyperparams = { epochs: 40, lr: 0.007, hidden: 32, dataset: 'PROTEINS' }
    sessionState.createSession = vi.fn().mockResolvedValue({ session_id: 'sess-gat' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })

    const startEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.type === 'gnn:start-training')
      .at(-1)

    expect(startEvent?.detail).toEqual(expect.objectContaining({
      task: 2,
      model: 'GAT',
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_focal_gamma: 1.5,
      task2_label_smoothing: 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: 0.20,
      task2_attn_dropout: 0.25,
      task2_readout_entropy_weight: 0.01,
      task2_density_contrastive_weight: 0.03,
      task2_early_stop_patience: 12,
    }))
  })

  it('dispatches the GraphSAGE Task 2 collapse-rescue recipe for live training', async () => {
    gnnState.isTraining = false
    gnnState.selectedTask = 2
    gnnState.selectedModel = 'SAGE'
    gnnState.hyperparams = { epochs: 40, lr: 0.008, hidden: 32, dataset: 'PROTEINS' }
    sessionState.createSession = vi.fn().mockResolvedValue({ session_id: 'sess-sage' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })

    const startEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.type === 'gnn:start-training')
      .at(-1)

    expect(startEvent?.detail).toEqual(expect.objectContaining({
      task: 2,
      model: 'SAGE',
      hidden: 48,
      dropout: 0.35,
      lr: 0.004,
      task2_pool: 'attention_sum',
      task2_class_weighting: true,
      task2_focal_gamma: 2.0,
      task2_label_smoothing: 0.02,
      task2_weight_decay: 1e-3,
      task2_edge_dropout: 0.15,
      task2_readout_entropy_weight: 0.01,
      task2_density_contrastive_weight: 0.02,
      task2_temperature_min: 1.0,
      task2_temperature_max: 1.5,
      task2_early_stop_patience: 8,
    }))
  })

  it('dispatches the GraphSAGE Task 1 boundary-rescue recipe for live training', async () => {
    gnnState.isTraining = false
    gnnState.selectedTask = 1
    gnnState.selectedModel = 'SAGE'
    gnnState.hyperparams = { epochs: 25, lr: 0.01, hidden: 64, dataset: 'cora' }
    sessionState.createSession = vi.fn().mockResolvedValue({ session_id: 'sess-task1-sage' })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)
    window.dispatchEvent(new CustomEvent('gnn:request-start-training'))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })

    const startEvent = dispatchSpy.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.type === 'gnn:start-training')
      .at(-1)

    expect(startEvent?.detail).toEqual(expect.objectContaining({
      task: 1,
      model: 'SAGE',
      task1_edge_dropout: 0.15,
      task1_boundary_patience: 8,
      task1_selection_metric: '0.4*val_acc+0.6*boundary_accuracy',
    }))
  })
})
