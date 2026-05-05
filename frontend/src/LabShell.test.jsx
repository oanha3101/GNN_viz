import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LabShell from './LabShell'

const gnnState = {
  mockMode: false,
  setMockMode: vi.fn(),
  setConfigOpen: vi.fn(),
  setTask: vi.fn(),
  setHyperparams: vi.fn(),
  setActiveProjectContext: vi.fn(),
  setActiveDatasetContext: vi.fn(),
  setUploadedFilePath: vi.fn(),
  setUploadMetadata: vi.fn(),
  setTaskConfig: vi.fn(),
  setDatasetName: vi.fn(),
  isTraining: false,
  selectedTask: 1,
  selectedNodeId: null,
  activeProjectId: 7,
  activeProjectName: 'Project A',
  activeDatasetVersionId: 31,
  activeDatasetVersionName: 'Dataset v1',
  datasetName: 'cora',
  uploadedFilePath: null,
  taskConfig: null,
  hyperparams: {
    dataset: 'cora',
    epochs: 10,
    lr: 0.01,
    hidden: 64,
    dropout: 0.5,
    heads: 4,
    aggregator: 'mean',
  },
  selectedModel: 'GCN',
}

const playerState = {
  snapshots: [],
  currentEpoch: 0,
  trainingDone: false,
  reportVersion: 0,
  loadSnapshots: vi.fn(),
  setDone: vi.fn(),
  isPlaying: false,
  play: vi.fn(),
  pause: vi.fn(),
  stepBack: vi.fn(),
  stepForward: vi.fn(),
}

const sessionState = {
  tryRecoverSession: vi.fn(() => null),
  resumeSession: vi.fn(),
}

const authState = {
  user: { id: 2, role: 'researcher', username: 'researcher' },
  verifyToken: vi.fn(() => Promise.resolve(true)),
}

vi.mock('./store/useGNNStore', () => {
  const store = (selector) => selector(gnnState)
  store.getState = () => gnnState
  store.setState = vi.fn()
  return { default: store }
})

vi.mock('./store/playerStore', () => {
  const store = (selector) => selector(playerState)
  store.getState = () => playerState
  return { default: store }
})

vi.mock('./store/sessionStore', () => {
  const store = (selector) => selector(sessionState)
  store.getState = () => sessionState
  return { default: store }
})

vi.mock('./store/authStore', () => {
  const store = (selector) => selector(authState)
  store.getState = () => authState
  return { default: store }
})

vi.mock('./hooks/useWebSocket', () => ({
  default: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}))

vi.mock('./components/Shell/LeftSidebar', () => ({
  default: ({ onOpenLibrary }) => (
    <button type="button" onClick={onOpenLibrary}>
      open-library
    </button>
  ),
}))

vi.mock('./components/TopologyView/TopologyView', () => ({ default: () => <div>topology-view</div> }))
vi.mock('./components/TopologyView/TaskTopology2', () => ({ default: () => <div>task-topology-2</div> }))
vi.mock('./components/TopologyView/TaskTopology3', () => ({ default: () => <div>task-topology-3</div> }))
vi.mock('./components/TopologyView/TaskTopology4', () => ({ default: () => <div>task-topology-4</div> }))
vi.mock('./components/TopologyView/TaskTopology5', () => ({ default: () => <div>task-topology-5</div> }))
vi.mock('./components/TopologyView/TaskTopology6', () => ({ default: () => <div>task-topology-6</div> }))
vi.mock('./components/EmbeddingView/EmbeddingView', () => ({ default: () => <div>embedding-view</div> }))
vi.mock('./components/MetricsChart/Task1MetricsPanel', () => ({ default: () => <div>task1-metrics</div> }))
vi.mock('./components/MetricsChart/Task2MetricsPanel', () => ({ default: () => <div>task2-metrics</div> }))
vi.mock('./components/MetricsChart/Task3MetricsPanel', () => ({ default: () => <div>task3-metrics</div> }))
vi.mock('./components/MetricsChart/Task4MetricsPanel', () => ({ default: () => <div>task4-metrics</div> }))
vi.mock('./components/MetricsChart/Task5MetricsPanel', () => ({ default: () => <div>task5-metrics</div> }))
vi.mock('./components/MetricsChart/Task6MetricsPanel', () => ({ default: () => <div>task6-metrics</div> }))
vi.mock('./components/MetricsChart/MetricsChart', () => ({ default: () => <div>metrics-chart</div> }))
vi.mock('./components/TopologyView/NodeInfoPanelV2', () => ({ default: () => <div>node-info</div> }))
vi.mock('./components/PlayerV2', () => ({ default: () => <div>player</div> }))
vi.mock('./components/TrainingControlsV2', () => ({ default: () => <div>training-controls</div> }))
vi.mock('./components/ConfigPanel/ConfigPanel', () => ({ default: () => <div>config-panel</div> }))
vi.mock('./components/TopologyView/InductiveDemo', () => ({ default: () => <div>inductive-demo</div> }))
vi.mock('./components/TopologyView/ReadoutMonitor', () => ({ default: () => <div>readout-monitor</div> }))
vi.mock('./components/TopologyView/Task4CommunityInspector', () => ({ default: () => <div>community-inspector</div> }))
vi.mock('./components/TopologyView/EmbeddingSpaceB', () => ({ default: () => <div>embedding-space-b</div> }))
vi.mock('./components/TopologyView/Task5NodeInspector', () => ({ default: () => <div>task5-node-inspector</div> }))
vi.mock('./components/TopologyView/LatentSpaceView', () => ({ default: () => <div>latent-space-view</div> }))
vi.mock('./components/TopologyView/ValidityMonitor', () => ({ default: () => <div>validity-monitor</div> }))
vi.mock('./components/TopologyView/PairProximityView', () => ({ default: () => <div>pair-proximity-view</div> }))
vi.mock('./components/TopologyView/LinkMetricsPanel', () => ({ default: () => <div>link-metrics</div> }))
vi.mock('./components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }) => <>{children}</> }))
vi.mock('./components/UploadPanel/DataInputView', () => ({ default: () => <div>data-input-view</div> }))
vi.mock('./components/TrainingReport', () => ({ default: () => <div>training-report</div> }))
vi.mock('./components/TopologyView/CommunityEvolution', () => ({ default: () => <div>community-evolution</div> }))
vi.mock('./components/ui/SidebarButton', () => ({ default: () => <div>sidebar-button</div> }))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderLab() {
  return render(
    <MemoryRouter initialEntries={['/app/lab']}>
      <Routes>
        <Route path="/app/lab" element={<LabShell />} />
        <Route path="/app/experiments" element={<div>experiments-page</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('LabShell run management navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes library actions to /app/experiments without mounting legacy library modals', async () => {
    renderLab()

    await waitFor(() => {
      expect(screen.getByText('topology-view')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'open-library' }))

    await waitFor(() => {
      expect(screen.getByText('experiments-page')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/app/experiments')
    })
  })
})
