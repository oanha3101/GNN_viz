import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskTopology2 from './TaskTopology2'

const playerState = {
  snapshots: [
    {
      graph_predictions: [1, 0],
      graph_confidences: [0.91, 0.52],
      confidence_margins: [0.03, 0.24],
      attention_entropy: [0.83, 0.21],
      graph_structural_metrics: [
        { density: 0.12, avg_clustering: 0.18, avg_degree: 2.6 },
        { density: 0.64, avg_clustering: 0.66, avg_degree: 3.7 },
      ],
      graph_correct: [0, 1],
      node_contributions: [[0.8, 0.1, 0.1], [0.4, 0.35, 0.15]],
    },
  ],
  currentEpochFloat: 0,
}

const gnnState = {
  taskData: {
    graphs: [
      { originalGraphId: 70, sourceIndex: 0, groundTruth: 0, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
      { originalGraphId: 71, sourceIndex: 1, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }], links: [] },
    ],
    classNames: ['A', 'B'],
  },
  classNames: ['A', 'B'],
  selectedNodeId: null,
  task2FocusMode: 'all',
  task2GallerySort: 'priority',
  task2ClassFilter: 'all',
  task2SelectedCell: { pred: 1, gt: 0 },
  setSelectedNode: vi.fn(),
  setHoveredNode: vi.fn(),
  setTask2GallerySort: vi.fn(),
  setTask2ClassFilter: vi.fn(),
}

vi.mock('react-force-graph-2d', () => ({
  default: () => <div data-testid="fg" />,
}))

vi.mock('./NodeHoverCard', () => ({
  default: () => <div />,
}))

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

describe('TaskTopology2 task 2 gallery', () => {
  beforeEach(() => {
    gnnState.setSelectedNode = vi.fn()
    gnnState.setTask2GallerySort = vi.fn()
    gnnState.setTask2ClassFilter = vi.fn()
  })

  it('shows research metadata and sort controls', () => {
    render(<TaskTopology2 />)

    expect(screen.getByRole('button', { name: 'Priority' })).toBeInTheDocument()
    expect(screen.getByText(/margin 3%/i)).toBeInTheDocument()
    expect(screen.getByText('diffuse')).toBeInTheDocument()
  })

  it('updates sort and selects graph by original graph id', () => {
    render(<TaskTopology2 />)

    fireEvent.click(screen.getByRole('button', { name: 'Confidence' }))
    expect(gnnState.setTask2GallerySort).toHaveBeenCalledWith('confidence_desc')

    fireEvent.click(screen.getByRole('button', { name: /G#70/i }))
    expect(gnnState.setSelectedNode).toHaveBeenCalledWith(70)
  })

  it('can render the full collection in forced export mode', () => {
    render(<TaskTopology2 forcedGallerySort="confidence_desc" showFullCollection hideGalleryControls />)

    expect(screen.getByText(/showing the full collection in one view/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confidence' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prev' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Page 1\//i)).not.toBeInTheDocument()
  })
})
