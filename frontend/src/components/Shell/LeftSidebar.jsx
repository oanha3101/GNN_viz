import React from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Dna,
  FolderUp,
  Globe2,
  Layers,
  Link2,
  Monitor,
  Network,
  Settings,
  Users,
} from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'
import SidebarButton from '../ui/SidebarButton'

const TASKS = [
  { id: 1, label: 'Phân loại nút', icon: Network },
  { id: 2, label: 'Phân loại đồ thị', icon: BarChart3 },
  { id: 3, label: 'Dự đoán liên kết', icon: Link2 },
  { id: 4, label: 'Phát hiện cộng đồng', icon: Users },
  { id: 5, label: 'Biểu diễn đồ thị', icon: Globe2 },
  { id: 6, label: 'Sinh đồ thị', icon: Dna },
]

const MODELS = [
  { id: 'GCN', label: 'GCN' },
  { id: 'GAT', label: 'GAT' },
  { id: 'SAGE', label: 'SAGE' },
]

export default function LeftSidebar({
  collapsed,
  onToggle,
  rightPanelOpen,
  setRightPanelOpen,
  activeRightTab,
  setActiveRightTab,
  onOpenLibrary,
  onOpenDataInput,
  onOpenConfig,
  onOpenAdmin,
  onOpenWorkspace,
  libraryLabel = 'Thư viện',
  showAdminButton = true,
  showWorkspaceButton = true,
}) {
  const selectedTask = useGNNStore((s) => s.selectedTask)
  const setTask = useGNNStore((s) => s.setTask)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setModel = useGNNStore((s) => s.setModel)
  const isTraining = useGNNStore((s) => s.isTraining)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)

  return (
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-md border-r border-white/5 shadow-2xl overflow-hidden pt-2">

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-4 px-2 space-y-6">
        <SidebarSection title="Nhiệm vụ" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            {TASKS.map((task) => (
              <SidebarButton
                key={task.id}
                icon={task.icon}
                label={task.label}
                active={selectedTask === task.id}
                collapsed={collapsed}
                onClick={() => setTask(task.id)}
                indicatorId="task-indicator"
                badge={selectedTask === task.id && isTraining ? 'TR' : null}
              />
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Mô hình" collapsed={collapsed}>
          <div className={`flex ${collapsed ? 'flex-col items-center' : 'flex-row'} gap-1 p-1 bg-white/5 rounded-xl border border-white/5`}>
            {MODELS.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
              <button
                key={model.id}
                onClick={() => setModel(model.id)}
                className={`relative flex-1 rounded-lg py-2 text-[10px] font-black transition-all duration-300 uppercase tracking-wide transform hover:scale-[1.03] active:scale-95 ${
                  isSelected ? 'text-white' : 'text-starlight/60 hover:text-white hover:bg-white/10'
                } ${collapsed ? 'w-full px-0' : 'px-2'}`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="model-active-bg"
                    className={`absolute inset-0 rounded-lg ${
                      model.id === 'GCN' ? 'bg-[#16a34a]' :
                      model.id === 'GAT' ? 'bg-[#0891b2]' :
                      'bg-[#be185d]'
                    }`}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">{model.label}</span>
              </button>
            )})}
          </div>
        </SidebarSection>

        <SidebarSection title="Giao diện" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            <SidebarButton icon={Network} label="Cấu trúc" active collapsed={collapsed} indicatorId="view-indicator" onClick={() => {}} />
            <SidebarButton
              icon={Globe2}
              label="Latent Space"
              active={rightPanelOpen && activeRightTab === 'embedding'}
              collapsed={collapsed}
              indicatorId="view-indicator"
              onClick={() => {
                setRightPanelOpen(true)
                setActiveRightTab('embedding')
              }}
            />
            <SidebarButton
              icon={Activity}
              label="Metrics"
              active={rightPanelOpen && activeRightTab === 'metrics'}
              collapsed={collapsed}
              indicatorId="view-indicator"
              onClick={() => {
                setRightPanelOpen(true)
                setActiveRightTab('metrics')
              }}
              badge={selectedNodeId !== null ? 1 : null}
            />
          </div>
        </SidebarSection>

        <SidebarSection title="Công cụ" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            {showWorkspaceButton ? (
              <SidebarButton icon={Layers} label="Workspace" collapsed={collapsed} indicatorId="tool-indicator" onClick={onOpenWorkspace} />
            ) : null}
            <SidebarButton icon={BookOpen} label={libraryLabel} collapsed={collapsed} indicatorId="tool-indicator" onClick={onOpenLibrary} />
            <SidebarButton icon={FolderUp} label="Tải dữ liệu" collapsed={collapsed} indicatorId="tool-indicator" onClick={onOpenDataInput} />
            <SidebarButton icon={Settings} label="Cấu hình" collapsed={collapsed} indicatorId="tool-indicator" onClick={onOpenConfig} />
            {showAdminButton ? (
              <SidebarButton icon={Monitor} label="Admin Console" collapsed={collapsed} indicatorId="tool-indicator" onClick={onOpenAdmin} />
            ) : null}
          </div>
        </SidebarSection>
      </div>

      <div className="p-4 border-t border-white/5 space-y-3 bg-black/20">
        {!collapsed ? (
          <div className="grid grid-cols-2 gap-2">
            <ShortcutHint keys={['[', ']']} label="Epoch" />
            <ShortcutHint keys={['Space']} label="Play" />
          </div>
        ) : null}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2.5 rounded-xl border border-white/5 bg-white/5 text-starlight hover:text-white hover:bg-white/10 hover:border-white/10 transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-sm group"
        >
          {collapsed ? <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" /> : <div className="flex items-center gap-2"><ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" /><span className="text-[10px] font-bold uppercase tracking-[0.2em]">Thu gọn</span></div>}
        </button>
      </div>
    </div>
  )
}

function SidebarSection({ title, children, collapsed }) {
  return (
    <div className="space-y-2">
      {!collapsed ? (
        <h4 className="px-3 text-[9px] font-black text-twilight uppercase tracking-[0.2em]">
          {title}
        </h4>
      ) : null}
      {children}
    </div>
  )
}

function ShortcutHint({ keys, label }) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/30 border border-white/5 shadow-inner">
      <div className="flex gap-1">
        {keys.map((key) => (
          <kbd key={key} className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-starlight shadow-sm">
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-[8px] font-bold text-twilight uppercase tracking-[0.1em]">{label}</span>
    </div>
  )
}
