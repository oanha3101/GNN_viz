import { useEffect, useCallback, useState, useRef } from 'react'
import {
  Network, BarChart3, Globe2, BookOpen, FolderUp, Settings, HelpCircle,
  PanelRightOpen, PanelRightClose, FlaskConical, Plug, ChevronLeft, ChevronRight,
  X,
} from 'lucide-react'
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
import LeftSidebar from './components/Shell/LeftSidebar'
import TrainingControls from './components/TrainingControlsV2'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import InductiveDemo from './components/TopologyView/InductiveDemo'
import ReadoutMonitor from './components/TopologyView/ReadoutMonitor'
import Task3MetricsPanel from './components/MetricsChart/Task3MetricsPanel'
import Task4MetricsPanel from './components/MetricsChart/Task4MetricsPanel'
import Task5MetricsPanel from './components/MetricsChart/Task5MetricsPanel'
import Task4CommunityInspector from './components/TopologyView/Task4CommunityInspector'
import EmbeddingSpaceB from './components/TopologyView/EmbeddingSpaceB'
import Task5NodeInspector from './components/TopologyView/Task5NodeInspector'
import LatentSpaceView from './components/TopologyView/LatentSpaceView'
import ValidityMonitor from './components/TopologyView/ValidityMonitor'
import PairProximityView from './components/TopologyView/PairProximityView'
import LinkMetricsPanel from './components/TopologyView/LinkMetricsPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import DataInputView from './components/UploadPanel/DataInputView'
import TrainingReport from './components/TrainingReport'
import ProjectLibrary from './components/Library/ProjectLibrary'
import Task2MetricsPanel from './components/MetricsChart/Task2MetricsPanel'
import Task6MetricsPanel from './components/MetricsChart/Task6MetricsPanel'
import CommunityEvolution from './components/TopologyView/CommunityEvolution'
import SidebarButton from './components/ui/SidebarButton'

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
  if (selectedTask === 3) return <LinkMetricsPanel />
  if (selectedTask === 4) return <Task4CommunityInspector />
  if (selectedTask === 5) return <Task5NodeInspector />
  if (selectedTask === 6) return <ValidityMonitor />
  return <NodeInfoPanel />
}

function PanelHeading({ title, subtitle, align = 'left' }) {
  // Sit in the extreme top-left/right corner with w-fit so the pill never
  // stretches over the Task 2 grid cards below.
  return (
    <div className={`absolute top-3 ${align === 'right' ? 'right-3' : 'left-3'} z-10 pointer-events-none w-fit max-w-[calc(100%-1.5rem)] rounded-lg border border-white/5 bg-panel-soft/70 backdrop-blur-xl px-3 py-1.5 flex items-center gap-2`}>
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_#06b6d4]" />
      <span className="text-micro uppercase font-black tracking-ultra text-white/90 leading-none">{title}</span>
      {subtitle && (
        <>
          <div className="w-px h-3 bg-white/10" />
          <span className="text-nano text-slate-400 font-bold uppercase tracking-wide leading-none">{subtitle}</span>
        </>
      )}
    </div>
  )
}

// ─── Custom horizontal drag-resize ──────────────────
function ResizableWorkspace({ rightPanelOpen, leftContent, rightContent }) {
  // Default width tuned for 1440×900: leaves ~1000px for the workspace so
  // Task 2 grid keeps 3+ columns without the user dragging the divider.
  const [rightWidth, setRightWidth] = useState(360) // px
  const MIN_RIGHT = 260
  const MAX_RIGHT = 800
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    startW.current = rightWidth
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [rightWidth])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    // drag left = increase right panel width
    const delta = startX.current - e.clientX
    const newW = Math.min(MAX_RIGHT, Math.max(MIN_RIGHT, startW.current + delta))
    setRightWidth(newW)
  }, [])

  const onPointerUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div className="flex-1 flex h-full min-w-0 min-h-0 overflow-hidden">
      {/* Left: Topology — takes all remaining flex space */}
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {leftContent}
      </div>

      {/* Drag divider — only visible when right panel is open */}
      {rightPanelOpen && (
        <div
          className="resize-handle resize-handle-horizontal shrink-0 h-full cursor-col-resize select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}

      {/* Right panel — fixed px width, slides in/out with CSS transition */}
      <div
        className="shrink-0 h-full overflow-hidden transition-[width] duration-200"
        style={{ width: rightPanelOpen ? rightWidth : 0 }}
      >
        {rightContent}
      </div>
    </div>
  )
}

// ─── Custom vertical drag-resize (inside right panel) ──
function VerticalResizable({ topContent, bottomContent }) {
  const [topHeight, setTopHeight] = useState(55) // %
  const dragging = useRef(false)
  const containerRef = useRef(null)
  const startY = useRef(0)
  const startPct = useRef(0)

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startPct.current = topHeight
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [topHeight])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current || !containerRef.current) return
    const totalH = containerRef.current.clientHeight
    const delta = e.clientY - startY.current
    const deltaPct = (delta / totalH) * 100
    const newPct = Math.min(82, Math.max(18, startPct.current + deltaPct))
    setTopHeight(newPct)
  }, [])

  const onPointerUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
      <div style={{ height: `${topHeight}%` }} className="min-h-0 overflow-hidden">
        {topContent}
      </div>
      <div
        className="resize-handle resize-handle-vertical shrink-0 w-full cursor-row-resize select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {bottomContent}
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────
function App() {
  const mockMode = useGNNStore((s) => s.mockMode)
  const setMockMode = useGNNStore((s) => s.setMockMode)
  const setConfigOpen = useGNNStore((s) => s.setConfigOpen)
  const isTraining = useGNNStore((s) => s.isTraining)
  const snapshots = usePlayerStore((s) => s.snapshots)
  const currentEpoch = usePlayerStore((s) => s.currentEpoch)
  const trainingDone = usePlayerStore((s) => s.trainingDone)
  const reportVersion = usePlayerStore((s) => s.reportVersion)
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const snapshot = snapshots[currentEpoch]
  const lastReportVersionRef = useRef(0)

  const [isDataInputOpen, setIsDataInputOpen] = useState(false)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('gnnSidebarCollapsed')
    return saved !== null ? JSON.parse(saved) : false
  })
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [activeRightTab, setActiveRightTab] = useState('embedding')

  const { connect, disconnect } = useWebSocket()

  useEffect(() => {
    const handler = (e) => { disconnect(); connect(e.detail) }
    window.addEventListener('gnn:start-training', handler)
    return () => window.removeEventListener('gnn:start-training', handler)
  }, [connect, disconnect])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.target.isContentEditable) return
      const { isPlaying, play, pause, stepBack, stepForward } = usePlayerStore.getState()
      switch (e.code) {
        case 'Space': e.preventDefault(); isPlaying ? pause() : play(); break
        case 'ArrowLeft': e.preventDefault(); stepBack(); break
        case 'ArrowRight': e.preventDefault(); stepForward(); break
        case 'BracketLeft':
        case 'BracketRight':
          e.preventDefault(); setRightPanelOpen((v) => !v); break
        default: break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isTraining && trainingDone && snapshots.length > 0 && reportVersion > lastReportVersionRef.current) {
      lastReportVersionRef.current = reportVersion
    }
  }, [isTraining, trainingDone, snapshots.length, reportVersion])

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('gnnSidebarCollapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Auto-open right panel when a node is selected
  useEffect(() => {
    if (selectedNodeId !== null) {
      setRightPanelOpen(true)
      setActiveRightTab('metrics')
    }
  }, [selectedNodeId])

  // Handle training request from sidebar
  useEffect(() => {
    const handler = () => {
      // Find and click the hidden TrainingControls start button
      // or we can just trigger the same event TrainingControls expects
      const gnnState = useGNNStore.getState()
      const hp = gnnState.hyperparams
      const up = gnnState.uploadedFilePath
      
      if (!gnnState.mockMode && !up) {
         alert("⚠️ CHƯA CÓ DỮ LIỆU UPLOAD!\n\nVui lòng nhấn nút 'Tải dữ liệu' ở sidebar để tải dữ liệu của bạn lên trước khi chạy mô hình thực tế.")
         return
      }

      window.dispatchEvent(new CustomEvent('gnn:start-training', {
        detail: {
          task: gnnState.selectedTask,
          model: gnnState.selectedModel,
          dataset: hp.dataset || 'cora',
          epochs: hp.epochs,
          lr: hp.lr,
          hidden: hp.hidden,
          dropout: hp.dropout,
          heads: hp.heads,
          aggregator: hp.aggregator,
          ...(up ? { uploaded_file_path: up } : {}),
          ...(gnnState.taskConfig || {})
        }
      }))
    }
    window.addEventListener('gnn:request-start-training', handler)
    return () => window.removeEventListener('gnn:request-start-training', handler)
  }, [])

  const valAcc = snapshot ? (snapshot.val_acc * 100).toFixed(1) : '--'
  const trainLoss = snapshot ? snapshot.train_loss.toFixed(3) : '--'

  const taskLabels = {
    1: 'Node Classification', 2: 'Graph Classification', 3: 'Link Prediction',
    4: 'Community Detection', 5: 'Graph Embedding', 6: 'Graph Generation',
  }

  return (
    <div className="app-shell h-screen flex flex-col bg-[#020617] text-slate-200 overflow-hidden">
      {/* ═══ Header ═══ */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800/60 bg-[#050c19]/80 backdrop-blur-xl z-50 shrink-0">
        <div className="flex items-center gap-5">
          {(() => {
            const datasetName = useGNNStore(s => s.datasetName)
            return (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Network size={18} className="text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-black tracking-[0.15em] text-white">GNN-INSIGHT</h1>
                  <div className="text-[9px] text-cyan-500/80 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <span className={`status-dot ${isTraining ? 'status-dot-training' : trainingDone ? 'status-dot-live' : 'status-dot-idle'}`} />
                    {isTraining ? 'Training...' : trainingDone ? 'Ready' : 'Standby'}
                    {datasetName && (
                      <span className="ml-2 text-slate-500 lowercase normal-case flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                        {datasetName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
          <div className="h-6 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <InductiveDemo />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className={`p-2 rounded-lg transition-all border ${rightPanelOpen ? 'bg-slate-800 text-cyan-400 border-slate-700' : 'bg-slate-900/50 text-slate-500 border-slate-800'}`}
            title={rightPanelOpen ? 'Hide Analysis' : 'Show Analysis'}
          >
            {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
          {snapshots.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-800/50">
              <div className="flex flex-col items-center">
                <span className="text-[7px] uppercase text-slate-500 font-bold">Accuracy</span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold">{valAcc}%</span>
              </div>
              <div className="w-px h-4 bg-slate-800" />
              <div className="flex flex-col items-center">
                <span className="text-[7px] uppercase text-slate-500 font-bold">Loss</span>
                <span className="text-[10px] font-mono text-orange-400 font-bold">{trainLoss}</span>
              </div>
            </div>
          )}
          <div className="h-6 w-px bg-slate-800" />
          <button
            onClick={() => setMockMode(!mockMode)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 ${mockMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
          >
            {mockMode ? <FlaskConical size={12} /> : <Plug size={12} />}
            {mockMode ? 'Mock Mode' : 'Live Data'}
          </button>
        </div>
      </header>

      {/* ═══ Main Workspace ═══ */}
      <main className="flex-1 flex overflow-hidden relative bg-[#020617] min-h-0">
        {/* Floating Sidebar Overlay */}
        <div className={`absolute left-0 top-0 bottom-0 z-40 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-[64px]' : 'w-[240px]'}`}>
          <LeftSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            activeRightTab={activeRightTab}
            setActiveRightTab={setActiveRightTab}
            rightPanelOpen={rightPanelOpen}
            setRightPanelOpen={setRightPanelOpen}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onOpenDataInput={() => setIsDataInputOpen(true)}
            onOpenConfig={() => setConfigOpen(true)}
          />
        </div>

        {/* Full-width content area (Sidebar is an overlay) */}
        <div 
          className="flex-1 flex min-w-0 h-full relative transition-all duration-300 ease-in-out"
          style={{ paddingLeft: sidebarCollapsed ? '64px' : '240px' }}
        >
          <ResizableWorkspace
            rightPanelOpen={rightPanelOpen}
            leftContent={
              <div className="w-full h-full relative overflow-visible bg-transparent">
                <PanelHeading title={taskLabels[selectedTask]} subtitle="Network Topology & Signal Flow" />
                <ErrorBoundary><TopologyRouter /></ErrorBoundary>
              </div>
            }
          rightContent={
            <VerticalResizable
              topContent={
                <div className="h-full flex flex-col bg-[#050c19] overflow-hidden">
                  <div className="flex items-center gap-1 p-2 bg-slate-900/40 border-b border-slate-800/60 shrink-0">
                    <button
                      onClick={() => setActiveRightTab('embedding')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeRightTab === 'embedding' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <Globe2 size={12} /> Latent Space
                    </button>
                    <button
                      onClick={() => setActiveRightTab('metrics')}
                      className={`flex-1 px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${activeRightTab === 'metrics' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <BarChart3 size={12} /> Performance
                    </button>
                  </div>
                  <div className="flex-1 relative overflow-hidden min-h-0">
                    {activeRightTab === 'embedding' ? (
                      <div className="h-full">
                        <ErrorBoundary><EmbeddingRouter /></ErrorBoundary>
                      </div>
                    ) : (
                      <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
                        <ErrorBoundary>
                          {selectedTask === 1 ? <Task1MetricsPanel /> :
                            selectedTask === 2 ? <Task2MetricsPanel /> :
                            selectedTask === 3 ? <Task3MetricsPanel /> :
                            selectedTask === 4 ? <Task4MetricsPanel /> :
                            selectedTask === 5 ? <Task5MetricsPanel /> :
                            selectedTask === 6 ? <Task6MetricsPanel /> :
                            <MetricsChart />}
                        </ErrorBoundary>
                      </div>
                    )}
                  </div>
                </div>
              }
              bottomContent={
                <div className="h-full bg-[#050c19] border-t border-slate-800/60 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/40 border-b border-slate-800/40 shrink-0">
                    <Network size={12} className="text-cyan-400" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Inspector</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <ErrorBoundary><InfoRouter /></ErrorBoundary>
                  </div>
                </div>
              }
            />
          }
        />
      </div>

        {/* Global Overlays */}
        <TrainingReport />
        <ConfigPanel />
        <ProjectLibrary isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} />
        {isDataInputOpen && <DataInputView onClose={() => setIsDataInputOpen(false)} />}
      </main>

      {/* ═══ Footer Controls ═══ */}
      <footer className="h-20 bg-[#050c19]/90 backdrop-blur-xl border-t border-slate-800/60 px-6 flex items-center gap-6 z-50 shrink-0">
        <div className="flex-1"><Player /></div>
        <div className="w-px h-10 bg-slate-800" />
        <div className="w-[300px]"><TrainingControls /></div>
      </footer>
    </div>
  )
}

export default App
