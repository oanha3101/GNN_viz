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
    gnnState.uploadedFilePath = 'datasets/runtime/test-graph.pt'
    gnnState.taskConfig = null
    sessionState.sessionId = 'sess-123'
    sessionState.createSession = vi.fn()
    sessionState.setStatus = vi.fn()
    gnnState.setTraining = vi.fn()
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

    fireEvent.click(screen.getByRole('button', { name: /stop training/i }))

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

    fireEvent.click(screen.getByRole('button', { name: /stop training/i }))

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled()
    })
    expect(sessionState.setStatus).toHaveBeenCalledWith('stopped')
    expect(gnnState.setTraining).toHaveBeenCalledWith(false, 0.5)
  })

  it('does not dispatch live training when session creation fails', async () => {
    gnnState.isTraining = false
    sessionState.createSession = vi.fn().mockRejectedValue(new Error('403'))
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<TrainingControlsV2 />)

    fireEvent.click(screen.getByRole('button', { name: /run/i }))

    await waitFor(() => {
      expect(sessionState.createSession).toHaveBeenCalled()
    })
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'gnn:start-training' }))
    expect(gnnState.setTraining).toHaveBeenCalledWith(false, 0)
  })

  it('disables the start button for viewer accounts', () => {
    gnnState.isTraining = false
    authState.user = { id: 2, role: 'viewer', username: 'viewer' }

    render(<TrainingControlsV2 />)

    expect(screen.getByRole('button', { name: /run/i })).toBeDisabled()
  })
})
