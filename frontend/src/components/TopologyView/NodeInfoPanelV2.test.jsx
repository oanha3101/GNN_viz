import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NodeInfoPanelV2 from './NodeInfoPanelV2'

const gnnState = {
  selectedNodeId: 38,
  groundTruth: { 38: 2, 10: 2, 11: 1, 12: 2 },
  graphData: {
    nodes: [
      { id: 38, degree: 6, inTrainSet: true, original_id: 38 },
      { id: 10, degree: 2 },
      { id: 11, degree: 3 },
      { id: 12, degree: 1 },
    ],
    links: [
      { source: 38, target: 10 },
      { source: 38, target: 11 },
      { source: 12, target: 38 },
    ],
  },
  selectedModel: 'GCN',
  classNames: {
    1: 'Case Based',
    2: 'Neural Networks',
  },
  setSelectedNode: vi.fn(),
}

const playerState = {
  snapshots: Array.from({ length: 73 }, (_, index) => ({
    node_predictions: { 38: 2, 10: 2, 11: 0, 12: 2 },
    node_probabilities: { 38: [0.01, 0.01, 0.98] },
    node_confidence: { 38: 0.98 },
    node_correctness: { 38: 1 },
    neighbor_majority: {
      38: {
        majority_class: 2,
        majority_ratio: 0.5,
        total_neighbors: 6,
      },
    },
    attention_weights: [0.72, 0.48, 0.33],
    epoch: index,
  })),
  currentEpochFloat: 72,
}

vi.mock('../../store/useGNNStore', () => ({
  default: (selector) => (typeof selector === 'function' ? selector(gnnState) : gnnState),
}))

vi.mock('../../store/playerStore', () => ({
  default: (selector) => (typeof selector === 'function' ? selector(playerState) : playerState),
}))

vi.mock('../../store/sessionStore', () => ({
  default: (selector) => (typeof selector === 'function' ? selector({ experimentId: null }) : { experimentId: null }),
}))

vi.mock('../ResearchAnalyst/NodeStoryTimeline', () => ({
  default: () => <div>timeline</div>,
}))

describe('NodeInfoPanelV2', () => {
  beforeEach(() => {
    gnnState.setSelectedNode.mockClear()
  })

  it('keeps the existing inspector composition while applying the new visual classes', () => {
    const { container } = render(<NodeInfoPanelV2 />)

    expect(screen.getByText('Nút đang chọn')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nút 38' })).toBeInTheDocument()
    expect(screen.getByText('Nhãn thật')).toBeInTheDocument()
    expect(screen.getByText('Dự đoán hiện tại')).toBeInTheDocument()
    expect(screen.getByText('Bậc nút')).toBeInTheDocument()
    expect(screen.getByText('Phân bố xác suất')).toBeInTheDocument()
    expect(screen.getByText('Các nút lân cận')).toBeInTheDocument()
    expect(container.querySelector('.lab-inspector-card')).toBeTruthy()
    expect(container.querySelector('.lab-inspector-status-pill')).toBeTruthy()
    expect(container.querySelector('.lab-inspector-prob-track')).toBeTruthy()
  })

  it('keeps the dismiss action unchanged', () => {
    render(<NodeInfoPanelV2 />)

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn' }))
    expect(gnnState.setSelectedNode).toHaveBeenCalledWith(null)
  })
})
