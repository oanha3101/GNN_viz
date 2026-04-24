import React from 'react'
import {
  Network, BarChart3, Link2, Users, Globe2, Dna,
  Layers, Database, Activity, 
  BookOpen, FolderUp, Settings, HelpCircle,
  ChevronLeft, ChevronRight,
  Monitor
} from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { API_BASE } from '../../utils/api'
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
  { id: 'GCN', label: 'GCN', color: '#3b82f6' },
  { id: 'GAT', label: 'GAT', color: '#22c55e' },
  { id: 'SAGE', label: 'SAGE', color: '#f97316' },
]

export default function LeftSidebar({
  collapsed, onToggle,
  rightPanelOpen, setRightPanelOpen,
  activeRightTab, setActiveRightTab,
  onOpenLibrary, onOpenDataInput, onOpenConfig
}) {
  const selectedTask = useGNNStore(s => s.selectedTask)
  const setTask = useGNNStore(s => s.setTask)
  const selectedModel = useGNNStore(s => s.selectedModel)
  const setModel = useGNNStore(s => s.setModel)
  const isTraining = useGNNStore(s => s.isTraining)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)

  return (
    <div className="h-full flex flex-col bg-[#050c19]/60 backdrop-blur-3xl border-r border-white/5 shadow-2xl overflow-hidden">
      {/* Brand / Logo Area */}
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'px-6'} py-6 border-b border-white/5`}>
        {!collapsed ? (
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tighter text-white flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_#06b6d4]" />
              GNN-INSIGHT
            </span>
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-0.5">Neural Explorer</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Network size={16} className="text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-4 px-2 space-y-6">
        {/* Task Selection Section */}
        <SidebarSection title="Nhiệm vụ" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            {TASKS.map(task => (
              <SidebarButton
                key={task.id}
                icon={task.icon}
                label={task.label}
                active={selectedTask === task.id}
                collapsed={collapsed}
                onClick={() => setTask(task.id)}
                badge={selectedTask === task.id && isTraining ? 'TR' : null}
              />
            ))}
          </div>
        </SidebarSection>

        {/* Model Selection Section */}
        <SidebarSection title="Mô hình" collapsed={collapsed}>
          <div className={`flex ${collapsed ? 'flex-col items-center' : 'flex-row'} gap-1 p-1 bg-slate-900/50 rounded-xl border border-white/5`}>
            {MODELS.map(model => (
              <button
                key={model.id}
                onClick={() => setModel(model.id)}
                className={`flex-1 rounded-lg py-2 text-[10px] font-black transition-all duration-200 ${
                  selectedModel === model.id
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-300'
                } ${collapsed ? 'w-full px-0' : 'px-2'}`}
              >
                {model.id}
              </button>
            ))}
          </div>
        </SidebarSection>

        {/* Views Section */}
        <SidebarSection title="Giao diện" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            <SidebarButton
              icon={Network}
              label="Cấu trúc (Topology)"
              active={true} // Main view is always active
              collapsed={collapsed}
              onClick={() => {}}
            />
            <SidebarButton
              icon={Globe2}
              label="Không gian ẩn (Latent)"
              active={rightPanelOpen && activeRightTab === 'embedding'}
              collapsed={collapsed}
              onClick={() => { setRightPanelOpen(true); setActiveRightTab('embedding') }}
            />
            <SidebarButton
              icon={Activity}
              label="Hiệu năng (Metrics)"
              active={rightPanelOpen && activeRightTab === 'metrics'}
              collapsed={collapsed}
              onClick={() => { setRightPanelOpen(true); setActiveRightTab('metrics') }}
              badge={selectedNodeId !== null ? 1 : null}
            />
          </div>
        </SidebarSection>

        {/* Tools Section */}
        <SidebarSection title="Công cụ" collapsed={collapsed}>
          <div className="flex flex-col gap-1">
            <SidebarButton icon={BookOpen} label="Thư viện" collapsed={collapsed} onClick={onOpenLibrary} />
            <SidebarButton icon={FolderUp} label="Tải dữ liệu" collapsed={collapsed} onClick={onOpenDataInput} />
            <SidebarButton icon={Settings} label="Cấu hình" collapsed={collapsed} onClick={onOpenConfig} />
          </div>
        </SidebarSection>
      </div>

      {/* Footer / Shortcut Hints */}
      <div className="p-4 border-t border-white/5 space-y-3">
        {!collapsed && (
          <div className="grid grid-cols-2 gap-2">
            <ShortcutHint keys={['[' , ']']} label="Epoch" />
            <ShortcutHint keys={['Space']} label="Play" />
          </div>
        )}
        <button 
          onClick={onToggle}
          className="w-full flex items-center justify-center py-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"
        >
          {collapsed ? <ChevronRight size={18} /> : <div className="flex items-center gap-2"><ChevronLeft size={18} /><span className="text-[10px] font-bold uppercase tracking-widest">Thu gọn</span></div>}
        </button>
      </div>
    </div>
  )
}

function SidebarSection({ title, children, collapsed }) {
  return (
    <div className="space-y-2">
      {!collapsed && (
        <h4 className="px-3 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
          {title}
        </h4>
      )}
      {children}
    </div>
  )
}

function ShortcutHint({ keys, label }) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg bg-white/[0.02] border border-white/5">
      <div className="flex gap-1">
        {keys.map(key => (
          <kbd key={key} className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-mono text-slate-400 border border-slate-700 shadow-sm">
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tight">{label}</span>
    </div>
  )
}
