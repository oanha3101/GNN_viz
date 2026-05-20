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
    TopologyRouter: () => React.createElement('div', null, 'task-one-structure-page'),
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

    fireEvent.click(screen.getByRole('button', { name: /print \/ save pdf/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/app/lab/analysis/report')
    })
    await waitFor(() => {
      expect(preloadLabAnalysisViews).toHaveBeenCalledWith(1)
    })

    await waitFor(() => {
      expect(window.print).toHaveBeenCalledTimes(1)
    })
    expect(document.querySelectorAll('.lab-report-section')).toHaveLength(6)
    expect(document.querySelector('.lab-report-book')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-overview')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-confusion')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-homophily')).toBeInTheDocument()
    expect(screen.getByText('task-one-metrics-insights')).toBeInTheDocument()
    expect(screen.getByText('task-one-latent-page')).toBeInTheDocument()
    expect(screen.getByText('task-one-structure-page')).toBeInTheDocument()
  })
})
