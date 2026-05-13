import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Task3MetricsPanel from './Task3MetricsPanel'

const playerState = {
  snapshots: [],
  currentEpochFloat: 0,
}

const gnnState = {
  taskData: {
    testEdges: [],
  },
  setFocusedEdge: vi.fn(),
}

vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  }
})

vi.mock('../../store/playerStore', () => {
  const store = (selector) => (typeof selector === 'function' ? selector(playerState) : playerState)
  store.getState = () => playerState
  return { default: store }
})

vi.mock('../../store/useGNNStore', () => {
  const store = (selector) => (typeof selector === 'function' ? selector(gnnState) : gnnState)
  store.getState = () => gnnState
  return { default: store }
})

describe('Task3MetricsPanel', () => {
  beforeEach(() => {
    playerState.snapshots = []
    playerState.currentEpochFloat = 0
    gnnState.taskData = { testEdges: [] }
    gnnState.setFocusedEdge = vi.fn()
  })

  it('renders loss from train_loss snapshots in overview tab', () => {
    playerState.snapshots = [
      {
        epoch: 0,
        auc: 0.81,
        train_loss: 0.4321,
        edge_scores: [],
      },
    ]

    render(<Task3MetricsPanel />)

    expect(screen.getByText('0.432')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})
