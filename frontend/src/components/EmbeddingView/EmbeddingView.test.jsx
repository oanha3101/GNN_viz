import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmbeddingView from './EmbeddingView'

const playerState = {
  snapshots: [
    {
      graph_embeddings_2d: [[0, 0], [1, 1]],
      graph_predictions: [1, 0],
      graph_confidences: [0.92, 0.41],
      confidence_margins: [0.31, 0.08],
      attention_entropy: [0.2, 0.8],
      graph_structural_metrics: [
        { density: 0.12, avg_clustering: 0.15, avg_degree: 2.2 },
        { density: 0.7, avg_clustering: 0.75, avg_degree: 4.1 },
      ],
      graph_correct: [0, 1],
      node_contributions: [[0.7, 0.2, 0.1], [0.2, 0.3, 0.5]],
    },
  ],
  currentEpochFloat: 0,
}

const gnnState = {
  selectedTask: 2,
  selectedNodeId: null,
  hoveredGraphId: null,
  task2EmbeddingColorMode: 'predicted',
  task2SelectedCell: { pred: 1, gt: 0 },
  taskData: {
    graphs: [
      { originalGraphId: 40, sourceIndex: 0, groundTruth: 0, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
      { originalGraphId: 41, sourceIndex: 1, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
    ],
  },
  setSelectedNode: vi.fn(),
  setHoveredGraph: vi.fn(),
  setTask2EmbeddingColorMode: vi.fn(),
}

let lastPlotProps = null

vi.mock('../primitives/LazyPlot', () => ({
  default: (props) => {
    lastPlotProps = props
    return (
      <div>
        <div data-testid="plot-opacity">{JSON.stringify(props.data?.[0]?.marker?.opacity || [])}</div>
        <button type="button" onClick={() => props.onClick?.({ points: [{ pointIndex: 1 }], event: {} })}>
          click-point
        </button>
      </div>
    )
  },
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

describe('EmbeddingView task 2', () => {
  beforeEach(() => {
    lastPlotProps = null
    gnnState.task2EmbeddingColorMode = 'predicted'
    gnnState.setSelectedNode = vi.fn()
    gnnState.setTask2EmbeddingColorMode = vi.fn((mode) => {
      gnnState.task2EmbeddingColorMode = mode
    })
  })

  it('dims non-matching points when a confusion cell is active', () => {
    render(<EmbeddingView />)

    expect(screen.getByTestId('plot-opacity')).toHaveTextContent('[1,0.18]')
  })

  it('switches color mode and resolves click to original graph id', () => {
    render(<EmbeddingView />)

    fireEvent.click(screen.getByRole('button', { name: 'Entropy' }))
    expect(gnnState.setTask2EmbeddingColorMode).toHaveBeenCalledWith('entropy')

    fireEvent.click(screen.getByRole('button', { name: 'click-point' }))
    expect(gnnState.setSelectedNode).toHaveBeenCalledWith(41)
    expect(lastPlotProps).toBeTruthy()
  })
})
