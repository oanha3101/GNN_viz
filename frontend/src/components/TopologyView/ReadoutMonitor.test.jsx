import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReadoutMonitor from './ReadoutMonitor'

const playerState = {
  snapshots: [
    {
      graph_predictions: [1, 0],
      graph_confidences: [0.93, 0.51],
      confidence_margins: [0.29, 0.06],
      attention_entropy: [0.18, 0.76],
      graph_structural_metrics: [
        { density: 0.14, avg_clustering: 0.18, avg_degree: 2.4 },
        { density: 0.72, avg_clustering: 0.7, avg_degree: 3.9 },
      ],
      graph_correct: [0, 1],
      node_contributions: [[0.7, 0.2, 0.1], [0.4, 0.35, 0.15]],
    },
  ],
  currentEpochFloat: 0,
}

const gnnState = {
  hoveredGraphId: null,
  selectedNodeId: 50,
  task2FocusMode: 'weak_class',
  task2SelectedCell: { pred: 1, gt: 0 },
  taskData: {
    graphs: [
      { originalGraphId: 50, sourceIndex: 0, groundTruth: 0, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
      { originalGraphId: 99, sourceIndex: 1, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }], links: [] },
    ],
    classNames: ['A', 'B'],
  },
  classNames: ['A', 'B'],
  selectedModel: 'GCN',
  setHoveredGraph: vi.fn(),
  setSelectedNode: vi.fn(),
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

describe('ReadoutMonitor task 2', () => {
  beforeEach(() => {
    gnnState.selectedNodeId = 50
    gnnState.setSelectedNode = vi.fn()
  })

  it('resolves pinned graph by original graph id instead of source index', () => {
    render(<ReadoutMonitor />)

    expect(screen.getByText('Graph #50')).toBeInTheDocument()
    expect(screen.getByText('Prediction')).toBeInTheDocument()
    expect(screen.getByText('Readout')).toBeInTheDocument()
    expect(screen.getByText('Model Lens')).toBeInTheDocument()
  })

  it('labels clustering as a coefficient so it is not confused with density', () => {
    render(<ReadoutMonitor />)

    expect(screen.getByText('Density')).toBeInTheDocument()
    expect(screen.getByText('Cluster Coef')).toBeInTheDocument()
  })

  it('falls back to the active weak-class slice when pinned graph is outside the slice', () => {
    gnnState.selectedNodeId = 99

    render(<ReadoutMonitor />)

    expect(screen.getByText('Graph #50')).toBeInTheDocument()
  })

  it('renders compact metric cards without a secondary force graph', () => {
    render(<ReadoutMonitor />)

    expect(screen.getAllByText('Confidence').length).toBeGreaterThan(0)
    expect(screen.getByText('Structure')).toBeInTheDocument()
    expect(screen.getByLabelText(/Correctness timeline/i)).toBeInTheDocument()
    expect(screen.queryByTestId('fg')).not.toBeInTheDocument()
  })

  it('opens the inspected graph in the center detail view', () => {
    render(<ReadoutMonitor />)

    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }))

    expect(gnnState.setSelectedNode).toHaveBeenCalledWith(50)
  })
})
