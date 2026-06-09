import { lazy } from 'react'
import useGNNStore from '../../store/useGNNStore'

const loadTopologyView = () => import('../TopologyView/TopologyView')
const loadTaskTopology2 = () => import('../TopologyView/TaskTopology2')
const loadTaskTopology3 = () => import('../TopologyView/TaskTopology3')
const loadTaskTopology4 = () => import('../TopologyView/TaskTopology4')
const loadTaskTopology5 = () => import('../TopologyView/TaskTopology5')
const loadTaskTopology6 = () => import('../TopologyView/TaskTopology6')
const loadEmbeddingView = () => import('../EmbeddingView/EmbeddingView')
const loadPairProximityView = () => import('../TopologyView/PairProximityView')
const loadCommunityEvolution = () => import('../TopologyView/CommunityEvolution')
const loadEmbeddingSpaceB = () => import('../TopologyView/EmbeddingSpaceB')
const loadLatentSpaceView = () => import('../TopologyView/LatentSpaceView')
const loadTask1MetricsPanel = () => import('../MetricsChart/Task1MetricsPanel')
const loadTask2MetricsPanel = () => import('../MetricsChart/Task2MetricsPanel')
const loadTask3MetricsPanel = () => import('../MetricsChart/Task3MetricsPanel')
const loadTask4MetricsPanel = () => import('../MetricsChart/Task4MetricsPanel')
const loadTask5MetricsPanel = () => import('../MetricsChart/Task5MetricsPanel')
const loadTask6MetricsPanel = () => import('../MetricsChart/Task6MetricsPanel')
const loadMetricsChart = () => import('../MetricsChart/MetricsChart')
const loadNodeInfoPanel = () => import('../TopologyView/NodeInfoPanelV2')
const loadReadoutMonitor = () => import('../TopologyView/ReadoutMonitor')
const loadLinkMetricsPanel = () => import('../TopologyView/LinkMetricsPanel')
const loadTask4CommunityInspector = () => import('../TopologyView/Task4CommunityInspector')
const loadTask5NodeInspector = () => import('../TopologyView/Task5NodeInspector')
const loadValidityMonitor = () => import('../TopologyView/ValidityMonitor')

const TopologyView = lazy(loadTopologyView)
const TaskTopology2 = lazy(loadTaskTopology2)
const TaskTopology3 = lazy(loadTaskTopology3)
const TaskTopology4 = lazy(loadTaskTopology4)
const TaskTopology5 = lazy(loadTaskTopology5)
const TaskTopology6 = lazy(loadTaskTopology6)
const EmbeddingView = lazy(loadEmbeddingView)
const PairProximityView = lazy(loadPairProximityView)
const CommunityEvolution = lazy(loadCommunityEvolution)
const EmbeddingSpaceB = lazy(loadEmbeddingSpaceB)
const LatentSpaceView = lazy(loadLatentSpaceView)
const Task1MetricsPanel = lazy(loadTask1MetricsPanel)
const Task2MetricsPanel = lazy(loadTask2MetricsPanel)
const Task3MetricsPanel = lazy(loadTask3MetricsPanel)
const Task4MetricsPanel = lazy(loadTask4MetricsPanel)
const Task5MetricsPanel = lazy(loadTask5MetricsPanel)
const Task6MetricsPanel = lazy(loadTask6MetricsPanel)
const MetricsChart = lazy(loadMetricsChart)
const NodeInfoPanel = lazy(loadNodeInfoPanel)
const ReadoutMonitor = lazy(loadReadoutMonitor)
const LinkMetricsPanel = lazy(loadLinkMetricsPanel)
const Task4CommunityInspector = lazy(loadTask4CommunityInspector)
const Task5NodeInspector = lazy(loadTask5NodeInspector)
const ValidityMonitor = lazy(loadValidityMonitor)

const TOPOLOGY_COMPONENTS = {
  1: TopologyView,
  2: TaskTopology2,
  3: TaskTopology3,
  4: TaskTopology4,
  5: TaskTopology5,
  6: TaskTopology6,
}

const TOPOLOGY_LOADERS = {
  1: loadTopologyView,
  2: loadTaskTopology2,
  3: loadTaskTopology3,
  4: loadTaskTopology4,
  5: loadTaskTopology5,
  6: loadTaskTopology6,
}

const EMBEDDING_COMPONENTS = {
  1: EmbeddingView,
  2: EmbeddingView,
  3: PairProximityView,
  4: CommunityEvolution,
  5: EmbeddingSpaceB,
  6: LatentSpaceView,
}

const EMBEDDING_LOADERS = {
  1: loadEmbeddingView,
  2: loadEmbeddingView,
  3: loadPairProximityView,
  4: loadCommunityEvolution,
  5: loadEmbeddingSpaceB,
  6: loadLatentSpaceView,
}

const INFO_COMPONENTS = {
  1: NodeInfoPanel,
  2: ReadoutMonitor,
  3: LinkMetricsPanel,
  4: Task4CommunityInspector,
  5: Task5NodeInspector,
  6: ValidityMonitor,
}

const INFO_LOADERS = {
  1: loadNodeInfoPanel,
  2: loadReadoutMonitor,
  3: loadLinkMetricsPanel,
  4: loadTask4CommunityInspector,
  5: loadTask5NodeInspector,
  6: loadValidityMonitor,
}

const METRIC_COMPONENTS = {
  1: Task1MetricsPanel,
  2: Task2MetricsPanel,
  3: Task3MetricsPanel,
  4: Task4MetricsPanel,
  5: Task5MetricsPanel,
  6: Task6MetricsPanel,
}

const METRIC_LOADERS = {
  1: loadTask1MetricsPanel,
  2: loadTask2MetricsPanel,
  3: loadTask3MetricsPanel,
  4: loadTask4MetricsPanel,
  5: loadTask5MetricsPanel,
  6: loadTask6MetricsPanel,
}

export const TASK_LABELS = {
  1: 'Node Classification',
  2: 'Graph Classification',
  3: 'Link Prediction',
  4: 'Community Detection',
  5: 'Graph Embedding',
  6: 'Graph Generation',
}

export function TopologyRouter(props) {
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const Component = TOPOLOGY_COMPONENTS[selectedTask] || TopologyView
  return <Component {...props} />
}

export function EmbeddingRouter(props) {
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const Component = EMBEDDING_COMPONENTS[selectedTask] || EmbeddingView
  return <Component {...props} />
}

export function InfoRouter(props) {
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const Component = INFO_COMPONENTS[selectedTask] || NodeInfoPanel
  return <Component {...props} />
}

export function MetricsRouter(props) {
  const selectedTask = useGNNStore((state) => state.selectedTask)
  const Component = METRIC_COMPONENTS[selectedTask] || MetricsChart
  return <Component {...props} />
}

export function preloadLabAnalysisViews(selectedTask) {
  const loaders = [
    TOPOLOGY_LOADERS[selectedTask] || loadTopologyView,
    EMBEDDING_LOADERS[selectedTask] || loadEmbeddingView,
    INFO_LOADERS[selectedTask] || loadNodeInfoPanel,
    METRIC_LOADERS[selectedTask] || loadMetricsChart,
  ]
  return Promise.all(loaders.map((load) => load().catch(() => null)))
}
