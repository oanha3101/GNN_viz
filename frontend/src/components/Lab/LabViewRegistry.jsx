import { lazy } from 'react'
import useGNNStore from '../../store/useGNNStore'

const TopologyView = lazy(() => import('../TopologyView/TopologyView'))
const TaskTopology2 = lazy(() => import('../TopologyView/TaskTopology2'))
const TaskTopology3 = lazy(() => import('../TopologyView/TaskTopology3'))
const TaskTopology4 = lazy(() => import('../TopologyView/TaskTopology4'))
const TaskTopology5 = lazy(() => import('../TopologyView/TaskTopology5'))
const TaskTopology6 = lazy(() => import('../TopologyView/TaskTopology6'))
const EmbeddingView = lazy(() => import('../EmbeddingView/EmbeddingView'))
const PairProximityView = lazy(() => import('../TopologyView/PairProximityView'))
const CommunityEvolution = lazy(() => import('../TopologyView/CommunityEvolution'))
const EmbeddingSpaceB = lazy(() => import('../TopologyView/EmbeddingSpaceB'))
const LatentSpaceView = lazy(() => import('../TopologyView/LatentSpaceView'))
const Task1MetricsPanel = lazy(() => import('../MetricsChart/Task1MetricsPanel'))
const Task2MetricsPanel = lazy(() => import('../MetricsChart/Task2MetricsPanel'))
const Task3MetricsPanel = lazy(() => import('../MetricsChart/Task3MetricsPanel'))
const Task4MetricsPanel = lazy(() => import('../MetricsChart/Task4MetricsPanel'))
const Task5MetricsPanel = lazy(() => import('../MetricsChart/Task5MetricsPanel'))
const Task6MetricsPanel = lazy(() => import('../MetricsChart/Task6MetricsPanel'))
const MetricsChart = lazy(() => import('../MetricsChart/MetricsChart'))
const NodeInfoPanel = lazy(() => import('../TopologyView/NodeInfoPanelV2'))
const ReadoutMonitor = lazy(() => import('../TopologyView/ReadoutMonitor'))
const LinkMetricsPanel = lazy(() => import('../TopologyView/LinkMetricsPanel'))
const Task4CommunityInspector = lazy(() => import('../TopologyView/Task4CommunityInspector'))
const Task5NodeInspector = lazy(() => import('../TopologyView/Task5NodeInspector'))
const ValidityMonitor = lazy(() => import('../TopologyView/ValidityMonitor'))

const TOPOLOGY_COMPONENTS = {
  1: TopologyView,
  2: TaskTopology2,
  3: TaskTopology3,
  4: TaskTopology4,
  5: TaskTopology5,
  6: TaskTopology6,
}

const EMBEDDING_COMPONENTS = {
  1: EmbeddingView,
  2: EmbeddingView,
  3: PairProximityView,
  4: CommunityEvolution,
  5: EmbeddingSpaceB,
  6: LatentSpaceView,
}

const INFO_COMPONENTS = {
  1: NodeInfoPanel,
  2: ReadoutMonitor,
  3: LinkMetricsPanel,
  4: Task4CommunityInspector,
  5: Task5NodeInspector,
  6: ValidityMonitor,
}

const METRIC_COMPONENTS = {
  1: Task1MetricsPanel,
  2: Task2MetricsPanel,
  3: Task3MetricsPanel,
  4: Task4MetricsPanel,
  5: Task5MetricsPanel,
  6: Task6MetricsPanel,
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
