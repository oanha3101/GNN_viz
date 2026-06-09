import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../contexts/LanguageContext'
import Task3MetricsPanel from './Task3MetricsPanel'

const playerState = {
  snapshots: [],
  currentEpochFloat: 0,
}

const gnnState = {
  taskData: {
    testEdges: [],
  },
  graphData: {
    nodes: [{ id: 1 }, { id: 2 }],
    links: [],
  },
  groundTruth: [],
  selectedModel: 'GAT',
  focusedEdgeIdx: null,
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
    gnnState.focusedEdgeIdx = null
    gnnState.setFocusedEdge = vi.fn()
  })

  it('renders loss, ranking metrics, and the executive summary in the overview tab', () => {
    playerState.snapshots = [
      {
        epoch: 0,
        auc: 0.81,
        train_loss: 0.4321,
        edge_scores: [0.9, 0.2],
      },
    ]
    gnnState.taskData = {
      testEdges: [
        { source: 1, target: 2, exists: true },
        { source: 2, target: 3, exists: false },
      ],
    }

    render(
      <LanguageProvider defaultLang="vi">
        <Task3MetricsPanel />
      </LanguageProvider>,
    )

    expect(screen.getByText('0.432')).toBeInTheDocument()
    expect(screen.getByText('Tổng quan')).toBeInTheDocument()
    expect(screen.getByText(/Precision@K/i)).toBeInTheDocument()
    expect(screen.getByText('Kết luận Task 3')).toBeInTheDocument()
  })
})
