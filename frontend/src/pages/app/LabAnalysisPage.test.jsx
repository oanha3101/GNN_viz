import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabAnalysisPage from './LabAnalysisPage'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { preloadLabAnalysisViews } from '../../components/Lab/LabViewRegistry'

vi.mock('../../components/Lab/LabViewRegistry', async () => {
  const React = await import('react')
  return {
    TASK_LABELS: { 1: 'Node Classification', 2: 'Graph Classification' },
    preloadLabAnalysisViews: vi.fn(() => Promise.resolve()),
    MetricsRouter: ({ forcedTab }) => React.createElement('div', null, `task-one-metrics-${forcedTab || 'default'}`),
    EmbeddingRouter: () => React.createElement('div', null, 'task-one-latent-page'),
    TopologyRouter: ({ reportMode }) => React.createElement('div', null, `task-one-structure-page-${reportMode ? 'report' : 'live'}`),
    InfoRouter: () => React.createElement('div', null, 'task-one-inspector-page'),
  }
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderAnalysis(initialPath = '/app/lab/analysis/metrics') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/app/lab/analysis/:panel" element={<><LocationProbe /><LabAnalysisPage /></>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LabAnalysisPage PDF export', () => {
  beforeEach(() => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    useGNNStore.setState({
      selectedTask: 1,
      datasetName: 'cora',
      taskData: null,
      classNames: null,
    })
    usePlayerStore.setState({
      snapshots: [{ epoch: 0, val_acc: 0.75, train_loss: 0.4 }],
      currentEpochFloat: 0,
      totalEpochs: 1,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes Task 1 metric exports through the full PDF book before printing', async () => {
    renderAnalysis()

    fireEvent.click(screen.getByRole('button', { name: /in \/ lưu pdf/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/lab/analysis/report')
    })
    await waitFor(() => {
      expect(preloadLabAnalysisViews).toHaveBeenCalledWith(1)
    })

    await waitFor(() => {
      expect(window.print).toHaveBeenCalledTimes(1)
    })
    expect(document.querySelectorAll('.lab-report-section')).toHaveLength(7)
    expect(document.querySelector('.lab-report-book')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-overview')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-confusion')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-homophily')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-insights')).toBeInTheDocument()
    expect(screen.getByText('task-one-latent-page')).toBeInTheDocument()
    expect(screen.getByText('task-one-structure-page-report')).toBeInTheDocument()
    expect(screen.getByText(/Chưa có giải thích cấp nút/i)).toBeInTheDocument()
  })

  it('prints the Task 2 GAT training recipe in the report summary', () => {
    useGNNStore.setState({
      selectedTask: 2,
      datasetName: 'PROTEINS',
      taskData: {
        graphs: [
          { originalGraphId: 0, groundTruth: 0, nodes: [{ id: 0 }, { id: 1 }], links: [{ source: 0, target: 1 }] },
          { originalGraphId: 1, groundTruth: 1, nodes: [{ id: 0 }, { id: 1 }, { id: 2 }], links: [{ source: 0, target: 1 }, { source: 1, target: 2 }] },
        ],
        classNames: ['Class 0', 'Class 1'],
      },
      classNames: ['Class 0', 'Class 1'],
      task2SelectedCell: { pred: 0, gt: 1 },
    })
    usePlayerStore.setState({
      currentEpochFloat: 0,
      totalEpochs: 1,
      snapshots: [{
        epoch: 0,
        graph_predictions: [0, 0],
        graph_confidences: [0.62, 0.55],
        confidence_margins: [0.24, 0.1],
        graph_correct: [1, 0],
        attention_entropy: [0.3, 0.8],
        graph_probabilities: [[0.62, 0.38], [0.55, 0.45]],
        graph_structural_metrics: [
          { density: 1, avg_clustering: 0, avg_degree: 1 },
          { density: 0.67, avg_clustering: 0, avg_degree: 1.33 },
        ],
        node_contributions: [[0.8, 0.2], [0.4, 0.35, 0.25]],
        model_hyperparams: {
          pool_type: 'attention_sum',
          task2_focal_gamma: 1.5,
          task2_class_weighting: true,
          task2_edge_dropout: 0.15,
          task2_attn_dropout: 0.25,
          task2_label_smoothing: 0.02,
        },
        calibration_temperature: 2.25,
        macro_f1: 0.58,
        balanced_accuracy: 0.58,
        accuracy: 0.5,
        best_selection_metric: '0.5*macro_f1+0.5*balanced_accuracy',
        best_epoch: 0,
        best_macro_f1: 0.58,
        best_balanced_accuracy: 0.58,
      }, {
        epoch: 1,
        graph_predictions: [0, 1],
        graph_confidences: [0.58, 0.52],
        confidence_margins: [0.18, 0.06],
        graph_correct: [1, 1],
        attention_entropy: [0.45, 0.7],
        graph_probabilities: [[0.58, 0.42], [0.48, 0.52]],
        graph_structural_metrics: [
          { density: 1, avg_clustering: 0, avg_degree: 1 },
          { density: 0.67, avg_clustering: 0, avg_degree: 1.33 },
        ],
        node_contributions: [[0.7, 0.3], [0.38, 0.34, 0.28]],
        macro_f1: 0.51,
        balanced_accuracy: 0.49,
        accuracy: 0.5,
      }],
    })

    renderAnalysis('/app/lab/analysis/report')

    expect(screen.getByText(/Sụp đổ lớp/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Hiệu chuẩn/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Thiên lệch shortcut/i)).toBeInTheDocument()
    expect(screen.getByText(/Mốc đọc tốt nhất: epoch 0 theo Macro F1 và Balanced Acc/i)).toBeInTheDocument()
    expect(screen.getByText(/Hãy dùng epoch này khi bạn quan tâm nhiều hơn tới cân bằng lớp và weak-class recall thay vì chỉ nhìn raw accuracy/i)).toBeInTheDocument()
    expect(screen.getByText(/Báo cáo nghiên cứu Task 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Attn dropout: 0.250/i)).toBeInTheDocument()
    expect(screen.getByText(/Focal gamma: 1.50/i)).toBeInTheDocument()
    expect(screen.getByText(/Temp: 2.25/i)).toBeInTheDocument()
  })
})
