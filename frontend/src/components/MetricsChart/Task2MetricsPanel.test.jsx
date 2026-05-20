import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Task2MetricsPanel from './Task2MetricsPanel'

const playerState = {
  snapshots: [
    {
      epoch: 0,
      graph_predictions: [1, 0],
      graph_confidences: [0.91, 0.62],
      confidence_margins: [0.24, 0.08],
      attention_entropy: [0.22, 0.81],
      graph_structural_metrics: [
        { density: 0.1, avg_clustering: 0.12, avg_degree: 2.1 },
        { density: 0.68, avg_clustering: 0.74, avg_degree: 3.8 },
      ],
      graph_correct: [1, 0],
      node_contributions: [[0.7, 0.2, 0.1], [0.1, 0.8, 0.1]],
      graph_embeddings_2d: [[0, 0], [1, 1]],
      graph_per_class_metrics: [
        { class_id: 0, support: 1, precision: 1, recall: 1, f1: 1, mean_confidence: 0.91 },
        { class_id: 1, support: 1, precision: 0.5, recall: 0.0, f1: 0.0, mean_confidence: 0.62 },
      ],
      graph_calibration: { ece: 0.21, bins: [] },
      readout_quality: { mean_entropy: 0.515, diffuse_share: 0.5, concentrated_share: 0.5 },
      trust_profile: {
        brier: 0.28,
        high_conf_wrong_rate: 0.5,
        shortcut_risk_score: 0.42,
        readout_diffuse_share: 0.5,
        calibration_temperature: 1.4,
      },
      structural_bias_signals: {
        confidence_vs_density: 0.42,
        confidence_vs_num_nodes: 0.38,
        shortcut_risk_score: 0.42,
      },
    },
    {
      epoch: 1,
      graph_predictions: [1, 1],
      graph_confidences: [0.88, 0.67],
      confidence_margins: [0.18, 0.12],
      attention_entropy: [0.3, 0.74],
      graph_structural_metrics: [
        { density: 0.12, avg_clustering: 0.14, avg_degree: 2.3 },
        { density: 0.64, avg_clustering: 0.68, avg_degree: 3.6 },
      ],
      graph_correct: [1, 1],
      node_contributions: [[0.6, 0.25, 0.15], [0.2, 0.6, 0.2]],
      graph_embeddings_2d: [[0.1, 0.1], [1.2, 1.1]],
      graph_per_class_metrics: [
        { class_id: 0, support: 1, precision: 1, recall: 1, f1: 1, mean_confidence: 0.88 },
        { class_id: 1, support: 1, precision: 1, recall: 1, f1: 1, mean_confidence: 0.67 },
      ],
      graph_calibration: { ece: 0.12, bins: [] },
      readout_quality: { mean_entropy: 0.52, diffuse_share: 0.5, concentrated_share: 0.5 },
      trust_profile: {
        brier: 0.18,
        high_conf_wrong_rate: 0,
        shortcut_risk_score: 0.35,
        readout_diffuse_share: 0.5,
        calibration_temperature: 1.2,
      },
      structural_bias_signals: {
        confidence_vs_density: 0.35,
        confidence_vs_num_nodes: 0.28,
        shortcut_risk_score: 0.35,
      },
      macro_f1: 0.74,
      balanced_accuracy: 0.71,
      val_acc: 0.78,
    },
  ],
  currentEpochFloat: 0,
  seekTo: vi.fn(),
}

const gnnState = {
  taskData: {
    graphs: [
      { originalGraphId: 10, sourceIndex: 0, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
      { originalGraphId: 11, sourceIndex: 1, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [] },
    ],
    classNames: ['A', 'B'],
  },
  classNames: ['A', 'B'],
  selectedNodeId: null,
  task2FocusMode: 'all',
  task2SelectedCell: null,
  setSelectedNode: vi.fn(),
  setTask2FocusMode: vi.fn(),
  setTask2SelectedCell: vi.fn(),
}

vi.mock('../primitives/Panel', () => ({
  default: ({ title, subtitle, actions, footer, children }) => (
    <div>
      <div>{title}</div>
      <div>{subtitle}</div>
      <div>{actions}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </div>
  ),
}))

vi.mock('./MetricsChart', () => ({
  default: () => <div data-testid="metrics-chart" />,
}))

vi.mock('./Task2ConfusionMatrix', () => ({
  default: ({ onSelectCell, selectedCell }) => (
    <button type="button" onClick={() => onSelectCell?.(1, 1)}>
      {selectedCell ? `cell-${selectedCell.pred}-${selectedCell.gt}` : 'matrix'}
    </button>
  ),
}))

vi.mock('./Task2HardCases', () => ({
  default: ({ graphs, onSelect }) => (
    <button type="button" onClick={() => onSelect?.(graphs[0]?.originalGraphId)}>
      hard-case
    </button>
  ),
}))

vi.mock('./Task2Diagnostics', () => ({
  default: ({ selectedCell }) => <div>{selectedCell ? 'scoped' : 'plain'}</div>,
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

describe('Task2MetricsPanel', () => {
  beforeEach(() => {
    gnnState.task2SelectedCell = null
    gnnState.task2FocusMode = 'all'
    gnnState.setSelectedNode = vi.fn()
    playerState.seekTo = vi.fn()
    gnnState.setTask2FocusMode = vi.fn((mode) => {
      gnnState.task2FocusMode = mode
    })
    gnnState.setTask2SelectedCell = vi.fn((cell) => {
      gnnState.task2SelectedCell = cell
    })
  })

  it('updates shared cell state when confusion cell is selected', () => {
    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Failures' }))
    fireEvent.click(screen.getByRole('button', { name: 'matrix' }))
    expect(gnnState.setTask2SelectedCell).toHaveBeenCalledWith({ pred: 1, gt: 1 })
  })

  it('shows selected cell scope in failures copy', () => {
    gnnState.task2SelectedCell = { pred: 1, gt: 1 }

    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Failures' }))
    expect(screen.getByText(/Hard cases below are scoped to this cell/i)).toBeInTheDocument()
  })

  it('renders batch heatmap cells with svg fills for PDF export', () => {
    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Failures' }))
    const fills = screen
      .getAllByTestId('task2-batch-heatmap-tile')
      .map((tile) => tile.querySelector('rect')?.getAttribute('fill'))

    expect(fills).toContain('#86efac')
    expect(fills).toContain('#fca5a5')
  })

  it('surfaces calibration and per-class metrics in the overview', () => {
    render(<Task2MetricsPanel />)

    expect(screen.getByText('ECE')).toBeInTheDocument()
    expect(screen.getByText('Per-class metrics')).toBeInTheDocument()
    expect(screen.getAllByText('Shortcut bias').length).toBeGreaterThan(0)
  })

  it('surfaces research signals in the overview', () => {
    render(<Task2MetricsPanel />)

    expect(screen.getByText('Research signals')).toBeInTheDocument()
    expect(screen.getByText('Class collapse')).toBeInTheDocument()
    expect(screen.getByText('Calibration')).toBeInTheDocument()
    expect(screen.getAllByText('Shortcut bias').length).toBeGreaterThan(0)
  })

  it('surfaces the Task 2 trust profile in the overview', () => {
    render(<Task2MetricsPanel />)

    expect(screen.getByText('Trust profile')).toBeInTheDocument()
    expect(screen.getByText('High-conf wrong')).toBeInTheDocument()
    expect(screen.getByText('Brier')).toBeInTheDocument()
    expect(screen.getByText('Readout diffuse')).toBeInTheDocument()
  })

  it('shows best epoch suggestion guidance in the overview', () => {
    render(<Task2MetricsPanel />)

    expect(screen.getByText(/Best epoch suggestion/i)).toBeInTheDocument()
    expect(screen.getByText(/Best Macro F1/i)).toBeInTheDocument()
    expect(screen.getByText(/Best Balanced Acc/i)).toBeInTheDocument()
  })

  it('routes weak-class watch into the weak-class failure slice', () => {
    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getByRole('button', { name: /Open slice/i }))
    expect(gnnState.setTask2FocusMode).toHaveBeenCalledWith('weak_class')
  })

  it('shows density shortcut vs weak-class misses block', () => {
    render(<Task2MetricsPanel />)

    expect(screen.getByText('Density shortcut vs weak-class misses')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Weak-class misses/i }).length).toBeGreaterThan(0)
  })

  it('auto-selects the featured graph for the active slice', () => {
    render(<Task2MetricsPanel />)

    expect(gnnState.setSelectedNode).toHaveBeenCalled()
  })

  it('jumps to suggested epoch from best epoch card', () => {
    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getAllByRole('button', { name: /Jump to epoch/i })[0])
    expect(playerState.seekTo).toHaveBeenCalled()
  })

  it('opens the weak-class failure lens from research signal', () => {
    render(<Task2MetricsPanel />)

    fireEvent.click(screen.getAllByRole('button', { name: /Open lens/i })[0])
    expect(gnnState.setTask2FocusMode).toHaveBeenCalled()
  })
})
