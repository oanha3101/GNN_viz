import { useEffect, useCallback, useState, useRef } from 'react'
import useGNNStore from './store/useGNNStore'
import usePlayerStore from './store/playerStore'
import useWebSocket from './hooks/useWebSocket'
import TopologyView from './components/TopologyView/TopologyView'
import TaskTopology2 from './components/TopologyView/TaskTopology2'
import TaskTopology3 from './components/TopologyView/TaskTopology3'
import TaskTopology4 from './components/TopologyView/TaskTopology4'
import TaskTopology5 from './components/TopologyView/TaskTopology5'
import TaskTopology6 from './components/TopologyView/TaskTopology6'
import EmbeddingView from './components/EmbeddingView/EmbeddingView'
import Task1MetricsPanel from './components/MetricsChart/Task1MetricsPanel'
import MetricsChart from './components/MetricsChart/MetricsChart'
import NodeInfoPanel from './components/TopologyView/NodeInfoPanelV2'
import Player from './components/PlayerV2'
import TaskSelector from './components/TaskSelectorV2'
import ModelSelector from './components/ModelSelectorV2'
import TrainingControls from './components/TrainingControlsV2'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import InductiveDemo from './components/TopologyView/InductiveDemo'
import ExportToolbar from './components/ExportToolbar'
import ReadoutMonitor from './components/TopologyView/ReadoutMonitor'
import ROCMonitor from './components/TopologyView/ROCMonitor'
import ModularityMonitor from './components/TopologyView/ModularityMonitor'
import DendrogramView from './components/TopologyView/DendrogramView'
import EmbeddingSpaceB from './components/TopologyView/EmbeddingSpaceB'
import StructurePreservation from './components/TopologyView/StructurePreservation'
import Task5NodeInspector from './components/TopologyView/Task5NodeInspector'
import LatentSpaceView from './components/TopologyView/LatentSpaceView'
import ValidityMonitor from './components/TopologyView/ValidityMonitor'
import PairProximityView from './components/TopologyView/PairProximityView'
import LinkMetricsPanel from './components/TopologyView/LinkMetricsPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import DataInputView from './components/UploadPanel/DataInputView'
import TrainingReport from './components/TrainingReport'
import ProjectLibrary from './components/Library/ProjectLibrary'
import FloatPanel from './components/FloatPanel'
import Task2MetricsPanel from './components/MetricsChart/Task2MetricsPanel'
import CommunityEvolution from './components/TopologyView/CommunityEvolution'

// Route to task-specific topology component
function TopologyRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  switch (selectedTask) {
    case 1: return <TopologyView />
    case 2: return <TaskTopology2 />
    case 3: return <TaskTopology3 />
    case 4: return <TaskTopology4 />
    case 5: return <TaskTopology5 />
    case 6: return <TaskTopology6 />
    default: return <TopologyView />
  }
}

// Route embedding view — task-specific views
function EmbeddingRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  if (selectedTask === 3) return <PairProximityView />
  if (selectedTask === 4) return <CommunityEvolution />
  if (selectedTask === 5) return <EmbeddingSpaceB />
  if (selectedTask === 6) return <LatentSpaceView />
  return <EmbeddingView />
}

// Node info only for tasks with node-level data
function InfoRouter() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  if (selectedTask === 1) return <NodeInfoPanel />
  if (selectedTask === 2) return <ReadoutMonitor />
  // Task 3 & 4: metrics are already in the bottom-right metrics panel
  // Inspector drawer shows simpler supplementary info
  if (selectedTask === 3) return <LinkMetricsPanel />
  if (selectedTask === 4) return <ModularityMonitor />
  if (selectedTask === 5) return <Task5NodeInspector />
  if (selectedTask === 6) return <ValidityMonitor />
  return <NodeInfoPanel />
}

function InspectorDrawer() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)

  if (![1, 5].includes(selectedTask) || selectedNodeId === null) return null

  return (
    <div className="absolute inset-y-4 right-4 z-30 w-[360px] max-w-[42%] rounded-[24px] border border-slate-700/50 bg-[#071120]/96 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/80">Phân tích nút</div>
          <div className="text-sm text-slate-400">Thông tin và mức đóng góp của nút đang chọn</div>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          Đóng
        </button>
      </div>
      <div className="h-[calc(100%-73px)] overflow-y-auto">
        <InfoRouter />
      </div>
    </div>
  )
}

function PanelHeading({ title, subtitle, align = 'left' }) {
  return (
    <div className={`absolute top-1 ${align === 'right' ? 'right-1' : 'left-1'} z-10 pointer-events-none max-w-fit rounded border border-slate-700/20 bg-[#020617]/60 backdrop-blur-[2px] px-2 py-0.5 flex items-center gap-1.5`}>
      <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-slate-500 leading-none whitespace-nowrap">{title}</span>
      <span className="text-[8px] text-slate-600/60 leading-none hidden sm:inline">·</span>
      <span className="text-[8px] text-slate-600/60 leading-none hidden sm:inline truncate max-w-[180px]">{subtitle}</span>
    </div>
  )
}

function App() {
  const mockMode = useGNNStore((s) => s.mockMode)
  const setMockMode = useGNNStore((s) => s.setMockMode)
  const setConfigOpen = useGNNStore((s) => s.setConfigOpen)
  const setReportOpen = useGNNStore((s) => s.setReportOpen)
  const isTraining = useGNNStore((s) => s.isTraining)
  const snapshots = usePlayerStore((s) => s.snapshots)
  const currentEpoch = usePlayerStore((s) => s.currentEpoch)
  const trainingDone = usePlayerStore((s) => s.trainingDone)
  const reportVersion = usePlayerStore((s) => s.reportVersion)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const snapshot = snapshots[currentEpoch]
  const lastReportVersionRef = useRef(0)

  const [isDataInputOpen, setIsDataInputOpen] = useState(false)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)

  // WebSocket for live backend training
  const { connect, disconnect } = useWebSocket()

  // Listen for live training start events from TrainingControls
  useEffect(() => {
    const handler = (e) => {
      disconnect()
      connect(e.detail)
    }
    window.addEventListener('gnn:start-training', handler)
    return () => window.removeEventListener('gnn:start-training', handler)
  }, [connect, disconnect])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      
      const { 
        isPlaying, play, pause, stepBack, stepForward, 
        currentEpochFloat, snapshots 
      } = usePlayerStore.getState()

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          isPlaying ? pause() : play()
          break
        case 'ArrowLeft':
          e.preventDefault()
          stepBack()
          break
        case 'ArrowRight':
          e.preventDefault()
          stepForward()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isTraining && trainingDone && snapshots.length > 0 && reportVersion > lastReportVersionRef.current) {
      lastReportVersionRef.current = reportVersion
      setReportOpen(true)
    }
  }, [isTraining, trainingDone, snapshots.length, reportVersion, setReportOpen])

  const valAcc = snapshot ? (snapshot.val_acc * 100).toFixed(1) : '--'
  const trainLoss = snapshot ? snapshot.train_loss.toFixed(3) : '--'

  const taskLabels = {
    1: 'Cấu trúc',
    2: 'Lưới phân loại',
    3: 'Link Prediction',
    4: 'Cộng đồng',
    5: 'Embedding đồ thị',
    6: 'Sinh đồ thị',
  }

  const panelSubtitles = {
    1: {
      topology: 'Các nút truyền thông tin qua cạnh',
      embedding: 'Embedding của nút tách dần thành cụm',
      metrics: 'Tín hiệu huấn luyện, kiểm định và overfit',
      inspector: 'Dự đoán, độ tin cậy và attention',
    },
    2: {
      topology: 'Readout ở mức đồ thị và tín hiệu cấu trúc',
      embedding: 'Mỗi điểm là một đồ thị hoàn chỉnh',
      metrics: 'Chất lượng phân loại đồ thị theo thời gian',
      inspector: 'Nút nào đóng góp mạnh cho dự đoán đồ thị',
    },
    3: {
      topology: 'Liên kết tiềm năng xuất hiện từ vùng lân cận',
      embedding: 'Khoảng cách cặp nút phản ánh độ tin cậy',
      metrics: 'Khả năng xếp hạng cạnh thật và cạnh giả',
      inspector: 'ROC, PR và chẩn đoán ở mức cặp nút',
    },
    4: {
      topology: 'Cộng đồng và nút cầu nối trong đồ thị',
      embedding: 'Phân cấp cụm và mức độ tách biệt',
      metrics: 'Chất lượng cộng đồng và độ sắc của ranh giới',
      inspector: 'Modularity, conductance và kích thước nhóm',
    },
    5: {
      topology: 'Cấu trúc đồ thị tải lên — cạnh tô theo proximity',
      embedding: 'Không gian embedding unsupervised (PCA / t-SNE)',
      metrics: 'k-NN preservation, Link AUC và reconstruction loss',
      inspector: 'Giữ cấu trúc và chất lượng tái tạo',
    },
    6: {
      topology: 'Các đồ thị sinh ra và chất lượng cấu trúc',
      embedding: 'Các điểm latent giải mã ra đồ thị khác nhau',
      metrics: 'Validity, novelty và động học học latent',
      inspector: 'Xu hướng chất lượng sinh và cân bằng loss',
    },
  }
  const currentPanelMeta = panelSubtitles[selectedTask] || panelSubtitles[1]

  return (
    <div className="app-shell h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 app-header">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-bold bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent tracking-[0.18em]">
              GNN-INSIGHT
            </h1>
            <div className="text-[10px] text-slate-500">Nhìn thấy mô hình học như thế nào, không chỉ kết quả cuối.</div>
          </div>
          <div className="w-px h-7 bg-slate-700/70" />
          <div className="hidden xl:flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/60 px-3 py-1 text-[10px] text-slate-400">
            <span className="text-cyan-300">Tác vụ {selectedTask}</span>
            <span>{taskLabels[selectedTask] || 'Cấu trúc'}</span>
          </div>
          <TaskSelector />
          <ModelSelector />
          <InductiveDemo />
        </div>

        <div className="flex items-center gap-3">
          {snapshots.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="bg-slate-800/50 rounded px-2 py-0.5 text-[10px]">
                <span className="text-slate-500">Độ đúng </span>
                <span className="text-blue-400 font-semibold">{valAcc}%</span>
              </div>
              <div className="bg-slate-800/50 rounded px-2 py-0.5 text-[10px]">
                <span className="text-slate-500">Mất mát </span>
                <span className="text-orange-400 font-semibold">{trainLoss}</span>
              </div>
            </div>
          )}

          {snapshots.length > 0 && !isTraining && (
            <button
              onClick={() => setReportOpen(true)}
              className="px-2 py-1 rounded text-[10px] font-medium transition-all bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-400/20"
            >
              Mở báo cáo
            </button>
          )}

          <ExportToolbar />

          <button
            onClick={() => setIsLibraryOpen(true)}
            className="px-2 py-1 rounded text-[10px] font-medium transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
          >
            📚 Thư viện
          </button>

          <button
            onClick={() => setIsDataInputOpen(true)}
            className="px-2 py-1 rounded text-[10px] font-medium transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
          >
            📁 Load Data
          </button>

          <button
            onClick={() => setMockMode(!mockMode)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-all
              ${mockMode
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
          >
            {mockMode ? '🧪 Mock' : '🔌 Live'}
          </button>

          <button
            onClick={() => setConfigOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg
                       bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm transition-all"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 overflow-hidden">
        <div className="panel-surface relative h-full overflow-hidden p-3">
          <div className="grid h-full grid-cols-[minmax(0,1.5fr)_minmax(420px,1.1fr)] grid-rows-[minmax(0,1fr)_minmax(180px,0.42fr)] gap-3">
            {/* LEFT: Topology — full height */}
            <div className="relative row-span-2 overflow-hidden rounded-[20px] border border-slate-800/60 bg-[#050c19]">
              <PanelHeading
                title={taskLabels[selectedTask] || 'Cấu trúc'}
                subtitle={currentPanelMeta.topology}
              />
              <ErrorBoundary>
                <TopologyRouter />
              </ErrorBoundary>
            </div>

            {/* TOP-RIGHT: Embedding space */}
            <div className="relative overflow-hidden rounded-[20px] border border-slate-800/60 bg-[#050c19]">
              <PanelHeading title={selectedTask === 4 ? "Community Evolution" : "Không gian embedding"} />
              <ErrorBoundary>
                <FloatPanel title={selectedTask === 4 ? "Community Evolution" : "Không gian Embedding"}>
                  <EmbeddingRouter />
                </FloatPanel>
              </ErrorBoundary>
            </div>

            {/* BOTTOM-RIGHT: Metrics — slightly taller now */}
            <div className="relative overflow-hidden rounded-[20px] border border-slate-800/60 bg-[#050c19]">
              <PanelHeading title="Phân tích & Chỉ số" />
              <ErrorBoundary>
                <FloatPanel title={`Phân tích — Task ${selectedTask}`}>
                  {selectedTask === 1 ? (
                    <Task1MetricsPanel />
                  ) : selectedTask === 2 ? (
                    <Task2MetricsPanel />
                  ) : selectedTask === 3 ? (
                    <ROCMonitor />
                  ) : selectedTask === 4 ? (
                    <ModularityMonitor />
                  ) : selectedTask === 5 ? (
                    <StructurePreservation />
                  ) : (
                    <MetricsChart />
                  )}
                </FloatPanel>
              </ErrorBoundary>
            </div>
          </div>

          <InspectorDrawer />
        </div>
      </main>

      <Player />
      <TrainingControls />
      <ConfigPanel />
      <TrainingReport />
      <ProjectLibrary isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
      
      {isDataInputOpen && <DataInputView onClose={() => setIsDataInputOpen(false)} />}
    </div>
  )
}

export default App
