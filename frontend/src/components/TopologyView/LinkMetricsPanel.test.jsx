import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../contexts/LanguageContext'
import LinkMetricsPanel from './LinkMetricsPanel'

const playerState = {
  snapshots: [],
  currentEpochFloat: 0,
}

const gnnState = {
  taskData: { testEdges: [] },
  graphData: null,
  groundTruth: [],
  focusedEdgeIdx: null,
  setFocusedEdge: vi.fn(),
}

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

describe('LinkMetricsPanel', () => {
  beforeEach(() => {
    playerState.snapshots = []
    playerState.currentEpochFloat = 0
    gnnState.taskData = { testEdges: [] }
    gnnState.graphData = null
    gnnState.groundTruth = []
    gnnState.focusedEdgeIdx = null
    gnnState.setFocusedEdge = vi.fn()
  })

  it('renders safely even when shortlist falls back to a minimally enriched edge', () => {
    playerState.snapshots = [
      {
        epoch: 0,
        auc: 0.872,
        edge_scores: [0.91],
      },
    ]
    gnnState.taskData = {
      testEdges: [{ source: 12, target: 99, exists: false, y: 0 }],
    }
    gnnState.graphData = {
      nodes: [{ id: 1 }, { id: 2 }],
      links: [],
    }

    render(
      <LanguageProvider defaultLang="vi">
        <LinkMetricsPanel />
      </LanguageProvider>,
    )

    expect(screen.getAllByText('Vì sao cạnh này?').length).toBeGreaterThan(0)
    expect(screen.getByText('12-99')).toBeInTheDocument()
    expect(screen.getByText('Hàng xóm chung')).toBeInTheDocument()
    expect(screen.getAllByText(/Embedding đang ủng hộ cạnh mạnh hơn topology cục bộ/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Topology')).toBeInTheDocument()
    expect(screen.getByText('Ổn định')).toBeInTheDocument()
  })
})
