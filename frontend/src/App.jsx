import { useEffect, useCallback, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import TaskSelector from './components/TaskSelectorV2'
import ModelSelector from './components/ModelSelectorV2'
import TrainingControls from './components/TrainingControlsV2'
import ConfigPanel from './components/ConfigPanel/ConfigPanel'
import InductiveDemo from './components/TopologyView/InductiveDemo'
import ReadoutMonitor from './components/TopologyView/ReadoutMonitor'
import ROCMonitor from './components/TopologyView/ROCMonitor'
import ModularityMonitor from './components/TopologyView/ModularityMonitor'
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
  if (selectedTask === 4) return <ModularityMonitor />
  if (selectedTask === 5) return <Task5NodeInspector />
  if (selectedTask === 6) return <ValidityMonitor />
  return <NodeInfoPanel />
}

function InspectorDrawer() {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)

  return (
    <AnimatePresence>
      {[1, 5].includes(selectedTask) && selectedNodeId !== null && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute inset-y-0 right-0 z-50 w-[380px] border-l border-slate-800/80 bg-[#071120]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="h-full overflow-y-auto custom-scrollbar">
            <InfoRouter />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PanelHeading({ title, subtitle, align = 'left' }) {
  return (
    <div className={`absolute top-4 ${align === 'right' ? 'right-4' : 'left-16'} z-10 pointer-events-none rounded-xl border border-white/5 bg-[#020617]/40 backdrop-blur-xl px-4 py-2 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)]`}>
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#06b6d4]" />
      <span className="text-[11px] uppercase font-black tracking-[0.2em] text-white/90 leading-none">{title}</span>
      {subtitle && (
        <>
          <div className="w-px h-3 bg-white/10" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none">{subtitle}</span>
        </>
      )}
    </div>
  )
}

// ─── Sidebar Navigation ─────────────────────────────
function AppSidebar({ collapsed, onToggle, activeTab, setActiveRightTab, rightPanelOpen, setRightPanelOpen, onOpenLibrary, onOpenDataInput, onOpenConfig }) {
  const nav = [
    { icon: Network, label: 'Topology', id: 'topology', action: () => {} },
    { icon: Globe2, label: 'Latent Space', id: 'embedding', action: () => { setRightPanelOpen(true); setActiveRightTab('embedding') } },
    { icon: BarChart3, label: 'Performance', id: 'metrics', action: () => { setRightPanelOpen(true); setActiveRightTab('metrics') } },
  ]
  const tools = [
    { icon: BookOpen, label: 'Library', action: onOpenLibrary },
    { icon: FolderUp, label: 'Upload Data', action: onOpenDataInput },
    { icon: Settings, label: 'Settings', action: onOpenConfig },
  ]
  return (
    <div className="h-full flex flex-col bg-[#050c19]/40 backdrop-blur-2xl border-r border-white/5 shadow-2xl">
      <div className="flex items-center justify-center py-3 border-b border-slate-800/40">
        <button onClick={onToggle} className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800/50 transition-all">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="flex-1 flex flex-col py-3 px-2 gap-1">
        {!collapsed && <div className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] mb-2 px-2">Views</div>}
        {nav.map((item) => (
          <SidebarButton key={item.id} icon={item.icon} label={item.label}
            active={item.id === 'topology' ? true : rightPanelOpen && activeTab === item.id}
            collapsed={collapsed} onClick={item.action} />
        ))}
        <div className="h-px bg-slate-800/50 my-3" />
        {!collapsed && <div className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] mb-2 px-2">Tools</div>}
        {tools.map((item) => (
          <SidebarButton key={item.label} icon={item.icon} label={item.label} collapsed={collapsed} onClick={item.action} />
        ))}
      </div>
      <div className="py-3 px-2 border-t border-slate-800/40">
        <SidebarButton icon={HelpCircle} label="Help & Guide" collapsed={collapsed} onClick={() => {}} />
      </div>
    </div>
  )
}

// ─── Custom horizontal drag-resize ──────────────────
function ResizableWorkspace({ rightPanelOpen, leftContent, rightContent }) {
  const [rightWidth, setRightWidth] = useState(420) // px
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      const { isPlaying, play, pause, stepBack, stepForward } = usePlayerStore.getState()
      switch (e.code) {
        case 'Space': e.preventDefault(); isPlaying ? pause() : play(); break
        case 'ArrowLeft': e.preventDefault(); stepBack(); break
        case 'ArrowRight': e.preventDefault(); stepForward(); break
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
            <TaskSelector />
            <ModelSelector />
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
        <div className={`absolute left-0 top-0 bottom-0 z-40 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-[56px]' : 'w-[200px]'}`}>
          <AppSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            activeTab={activeRightTab}
            setActiveRightTab={setActiveRightTab}
            rightPanelOpen={rightPanelOpen}
            setRightPanelOpen={setRightPanelOpen}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onOpenDataInput={() => setIsDataInputOpen(true)}
            onOpenConfig={() => setConfigOpen(true)}
          />
        </div>

        {/* Full-width content area (Sidebar is an overlay) */}
        <div className="flex-1 flex min-w-0 h-full relative">
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
                    <AnimatePresence mode="wait">
                      {activeRightTab === 'embedding' ? (
                        <motion.div key="embedding" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full">
                          <ErrorBoundary><EmbeddingRouter /></ErrorBoundary>
                        </motion.div>
                      ) : (
                        <motion.div key="metrics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
                          <ErrorBoundary>
                            {selectedTask === 1 ? <Task1MetricsPanel /> :
                             selectedTask === 2 ? <Task2MetricsPanel /> :
                             selectedTask === 3 ? <ROCMonitor /> :
                             selectedTask === 4 ? <ModularityMonitor /> :
                             selectedTask === 5 ? <StructurePreservation /> :
                             selectedTask === 6 ? <Task6MetricsPanel /> :
                             <MetricsChart />}
                          </ErrorBoundary>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
