import React, { useMemo } from 'react'
import { 
  X, Info, AlertCircle, CheckCircle2, Zap, Target, 
  Activity, BarChart3, TrendingUp, Search, Layers, 
  Eye, HelpCircle, ArrowRightCircle, History, Network
} from 'lucide-react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'
import { getClassColor, CLASS_NAMES } from '../utils/colors'
import { computeKHopNeighbors, countNeighborsPerHop } from '../utils/khop'
import Task3EdgeInspector from './TopologyView/Task3EdgeInspector'

// --- Common Sub-components ---

const SectionHeader = ({ icon: Icon, title, colorClass = "text-slate-500" }) => (
  <h4 className={`text-[10px] font-bold ${colorClass} uppercase tracking-widest mb-2 flex items-center gap-1.5`}>
    <Icon size={12} /> {title}
  </h4>
)

const NodeTimeline = ({ snapshots, selectedNodeId, groundTruth, nodeIdx }) => {
  if (!snapshots || snapshots.length === 0 || nodeIdx === -1) return null
  
  return (
    <div className="space-y-2">
      <SectionHeader icon={History} title="Timeline dự đoán" />
      <div className="flex gap-0.5 h-12 items-end bg-slate-950/30 rounded p-1 border border-slate-800/30 overflow-x-auto custom-scrollbar-hide">
        {snapshots.map((s, i) => {
          const pred = s.node_predictions?.[nodeIdx]
          const conf = s.node_confidences?.[nodeIdx] || s.node_confidence?.[nodeIdx] || 0.5
          const gt = groundTruth?.[nodeIdx]
          const isCorrect = gt !== undefined && pred !== undefined && gt === pred
          return (
            <div key={i} className="flex-1 min-w-[3px] h-full flex flex-col justify-end group relative">
              <div 
                className={`w-full rounded-t-[1px] transition-all ${isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                style={{ height: `${Math.max(10, conf * 100)}%`, opacity: 0.3 + (conf * 0.7) }} 
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50 pointer-events-none">
                <div className="bg-slate-800 text-[8px] text-white px-1.5 py-0.5 rounded shadow-xl border border-slate-700 whitespace-nowrap">
                  Epoch {i}: {conf.toFixed(2)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[8px] text-slate-600 font-mono uppercase">
        <span>Epoch 0</span>
        <span>Độ tin cậy theo thời gian</span>
        <span>Epoch {snapshots.length - 1}</span>
      </div>
    </div>
  )
}

// --- Task Specific Content Components ---

const Task1Inspector = ({ node, snap, snapshots, selectedNodeId, groundTruth, graphData }) => {
  // Map nodeId to index for array lookups
  const nodeIdx = useMemo(() => {
    if (!graphData?.nodes) return -1
    return graphData.nodes.findIndex(n => n.id === selectedNodeId)
  }, [graphData, selectedNodeId])

  const gt = node?.groundTruth ?? (nodeIdx !== -1 ? groundTruth?.[nodeIdx] : undefined)
  const pred = nodeIdx !== -1 ? snap?.node_predictions?.[nodeIdx] : undefined
  const conf = nodeIdx !== -1 ? (snap?.node_confidences?.[nodeIdx] || snap?.node_confidence?.[nodeIdx] || 0) : 0
  const isCorrect = gt !== undefined && pred !== undefined && gt === pred

  const kHopStats = useMemo(() => {
    if (selectedNodeId === null || !graphData?.links) return null
    const neighbors = computeKHopNeighbors(selectedNodeId, graphData.links, 2)
    const counts = countNeighborsPerHop(neighbors, 2)
    return { hop1: counts[0], hop2: counts[1] }
  }, [selectedNodeId, graphData])

  return (
    <div className="space-y-5">
      {/* WHAT Section */}
      <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50 shadow-inner">
        <SectionHeader icon={Eye} title="What - Trạng thái hiện tại" />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/30">
            <span className="text-[9px] text-slate-500 block uppercase mb-1 font-bold">Dự đoán</span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]" style={{ backgroundColor: getClassColor(pred) }} />
              <span className="text-xs font-bold text-slate-100">{CLASS_NAMES[pred] || `Class ${pred}`}</span>
            </div>
          </div>
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/30">
            <span className="text-[9px] text-slate-500 block uppercase mb-1 font-bold">Độ tin cậy</span>
            <span className="text-xs font-bold text-cyan-400 font-mono">{(conf * 100).toFixed(1)}%</span>
          </div>
        </div>
        {gt !== undefined && (
          <div className={`flex items-center justify-between p-2.5 rounded-lg border shadow-sm ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            <span className="text-[9px] font-bold uppercase tracking-wider">Xác thực với nhãn gốc</span>
            <div className="flex items-center gap-1.5">
              {isCorrect ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              <span className="text-[10px] font-black">{isCorrect ? 'CHÍNH XÁC' : 'SAI LỆCH'}</span>
            </div>
          </div>
        )}
      </section>

      {/* WHY Section */}
      <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50">
        <SectionHeader icon={HelpCircle} title="Why - Phân tích cấu trúc" />
        <div className="space-y-4">
          {kHopStats && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-slate-950/40 rounded border border-slate-800/20">
                <div className="text-[8px] text-slate-500 uppercase mb-0.5">1-Hop Neighbors</div>
                <div className="text-sm font-bold text-slate-200">{kHopStats.hop1}</div>
              </div>
              <div className="p-2 bg-slate-950/40 rounded border border-slate-800/20">
                <div className="text-[8px] text-slate-500 uppercase mb-0.5">2-Hop Neighbors</div>
                <div className="text-sm font-bold text-slate-200">{kHopStats.hop2}</div>
              </div>
            </div>
          )}
          
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-400">Tín hiệu lân cận</span>
              <span className="text-slate-200 font-mono">{(conf > 0.7 ? "Ổn định" : "Nhiễu")}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${conf > 0.8 ? 'bg-emerald-500' : conf > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${conf * 100}%` }} />
            </div>
          </div>
          
          <p className="text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-slate-700 pl-3">
             {conf > 0.8 ? "Cấu trúc lân cận đồng nhất giúp GNN dễ dàng hội tụ về đúng lớp." : 
              conf > 0.5 ? "Có sự mâu thuẫn nhẹ giữa đặc trưng node và nhãn của hàng xóm xung quanh." : 
              "Cảnh báo: Nút này nằm trong vùng 'Heterophily' cao — hàng xóm có nhãn rất khác biệt."}
          </p>
        </div>
      </section>

      {/* Timeline */}
      <NodeTimeline snapshots={snapshots} selectedNodeId={selectedNodeId} groundTruth={groundTruth} nodeIdx={nodeIdx} />

      {/* SO WHAT Section */}
      <section className="bg-indigo-500/5 rounded-xl p-3 border border-indigo-500/20">
        <SectionHeader icon={ArrowRightCircle} title="So What - Kiến nghị" colorClass="text-indigo-400" />
        <ul className="text-[10px] text-slate-400 space-y-2">
          {!isCorrect && (
            <li className="flex gap-2 items-start">
              <span className="text-indigo-500 mt-0.5">•</span>
              <span>Kiểm tra xem node này có phải là <b>Bridge Node</b> kết nối hai cộng đồng khác nhau không.</span>
            </li>
          )}
          {conf < 0.6 && (
            <li className="flex gap-2 items-start">
              <span className="text-indigo-500 mt-0.5">•</span>
              <span>Cân nhắc sử dụng <b>Attention Mechanism</b> để gán trọng số thấp cho các hàng xóm nhiễu.</span>
            </li>
          )}
          <li className="flex gap-2 items-start">
            <span className="text-indigo-500 mt-0.5">•</span>
            <span>Nếu nhãn dự đoán nhảy liên tục qua các epoch, hãy giảm <b>Learning Rate</b> hoặc tăng <b>Dropout</b>.</span>
          </li>
        </ul>
      </section>
    </div>
  )
}

// Removed obsolete Task3Inspector component since it is replaced by Task3EdgeInspector

const Task5Inspector = ({ node, snap, selectedNodeId }) => {
  const norm = snap?.embedding_norms?.[selectedNodeId] || 0
  const outlierData = snap?.outlier_scores?.find(o => o.node_id === selectedNodeId)
  const isOutlier = outlierData?.is_outlier
  const knnScore = snap?.per_node_knn_preservation?.[selectedNodeId] || 0
  
  const edgeErrors = useMemo(() => {
    if (!snap?.per_edge_reconstruction_error) return []
    return snap.per_edge_reconstruction_error.filter(e => e.source === selectedNodeId || e.target === selectedNodeId)
  }, [snap, selectedNodeId])

  return (
    <div className="space-y-5">
      <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50 shadow-inner">
        <SectionHeader icon={Eye} title="What - Embedding Quality" />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/30">
            <span className="text-[9px] text-slate-500 block uppercase mb-1 font-bold">Bảo tồn kNN</span>
            <span className={`text-xs font-bold font-mono ${knnScore > 0.7 ? 'text-emerald-400' : knnScore > 0.4 ? 'text-amber-400' : 'text-rose-400'}`}>
              {(knnScore * 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/30">
            <span className="text-[9px] text-slate-500 block uppercase mb-1 font-bold">L2 Norm</span>
            <span className="text-xs font-bold text-indigo-400 font-mono">{norm.toFixed(2)}</span>
          </div>
        </div>
        {isOutlier && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 animate-pulse">
            <AlertCircle size={14} />
            <span className="text-[10px] font-black uppercase tracking-tighter">ANOMALY DETECTED</span>
          </div>
        )}
      </section>

      {edgeErrors.length > 0 && (
        <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50">
          <SectionHeader icon={Zap} title="Reconstruction Errors" colorClass="text-amber-400" />
          <div className="space-y-2">
            {edgeErrors.slice(0, 3).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] p-1.5 bg-slate-950/40 rounded border border-slate-800/30">
                <span className="text-slate-400 font-mono">Edge → {e.source === selectedNodeId ? e.target : e.source}</span>
                <div className="flex items-center gap-2">
                   <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                     <div className="h-full bg-rose-500" style={{ width: `${e.error * 100}%` }} />
                   </div>
                   <span className="text-rose-400 font-bold">{(e.error * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50">
        <SectionHeader icon={HelpCircle} title="Why - Latent Analysis" />
        <p className="text-[10px] text-slate-500 leading-relaxed italic border-l-2 border-slate-700 pl-3">
          {isOutlier ? 
            "Nút này bị đẩy ra xa vùng mật độ cao của Latent Space. Có thể do tập đặc trưng chứa nhiễu hoặc cấu trúc liên kết cô lập." :
            knnScore < 0.5 ? 
            "Mâu thuẫn cấu trúc: Đồ thị gốc có kết nối nhưng không gian nhúng lại ở xa nhau." :
            "Biểu diễn ổn định: Cấu trúc lân cận được bảo tồn tốt."}
        </p>
      </section>

      <section className="bg-indigo-500/5 rounded-xl p-3 border border-indigo-500/20">
        <SectionHeader icon={ArrowRightCircle} title="So What - Tối ưu" colorClass="text-indigo-400" />
        <div className="text-[10px] text-slate-400 space-y-2">
          <p className="flex gap-2">
            <span className="text-indigo-500">•</span>
            <span>Cân nhắc chuẩn hóa đặc trưng đầu vào nếu Norm quá lớn.</span>
          </p>
        </div>
      </section>
    </div>
  )
}

// --- Node Metadata Section (Common for all tasks) ---

const NodeMetadataSection = ({ node }) => {
  if (!node) return null

  const hasFeatures = node.features && Object.keys(node.features).length > 0
  
  return (
    <section className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/50">
      <SectionHeader icon={Layers} title="Thông tin gốc (Node Meta)" />
      
      <div className="space-y-3">
        {/* Basic Information */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="bg-slate-950/40 p-2 rounded border border-slate-800/30">
            <span className="text-slate-500 block uppercase mb-0.5">Original ID</span>
            <span className="text-indigo-300 font-mono font-bold truncate block" title={node.original_id || node.id}>
              {node.original_id || node.id}
            </span>
          </div>
          <div className="bg-slate-950/40 p-2 rounded border border-slate-800/30">
            <span className="text-slate-500 block uppercase mb-0.5">Degree (Bậc)</span>
            <span className="text-slate-300 font-mono font-bold">{node.degree || 0}</span>
          </div>
        </div>

        {/* Label Information */}
        {node.label_name !== undefined && (
          <div className="flex justify-between items-center bg-indigo-500/10 p-2 rounded border border-indigo-500/20">
             <span className="text-indigo-400 text-[10px] uppercase font-bold">Original Label (Nhãn)</span>
             <span className="text-indigo-200 text-xs font-bold px-2 py-0.5 bg-indigo-500/20 rounded">
               {node.label_name}
             </span>
          </div>
        )}

        {/* Features Information */}
        {hasFeatures && (
          <div className="mt-2 pt-2 border-t border-slate-800/40">
            <span className="text-slate-500 text-[9px] uppercase font-bold block mb-2">Raw Features Data (Đặc trưng)</span>
            <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
               {Object.entries(node.features).map(([key, val]) => (
                 <div key={key} className="flex justify-between items-center text-[9px] bg-slate-950/60 px-1.5 py-1 rounded">
                   <span className="text-slate-400 truncate w-14" title={key}>{key}</span>
                   <span className="text-emerald-400 font-mono font-bold truncate pl-1" title={String(val)}>
                     {typeof val === 'number' ? 
                       (Number.isInteger(val) ? val : val.toFixed(4)) 
                       : String(val)}
                   </span>
                 </div>
               ))}
            </div>
          </div>
        )}
        
        {/* Placeholder if no rich data */}
        {!hasFeatures && !node.label_name && !node.original_id && (
           <div className="text-center p-2 rounded bg-slate-950/20 border border-dashed border-slate-800/50">
              <span className="text-[10px] text-slate-500 italic">Tính năng tạo Mock Data không cung cấp Meta đặc trưng. Xin vui lòng Upload File tĩnh.</span>
           </div>
        )}
      </div>
    </section>
  )
}

// --- Main Unified Inspector Shell ---

export default function UnifiedInspector() {
  const selectedTask = useGNNStore(s => s.selectedTask)
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const graphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const currentEpoch = Math.floor(currentEpochFloat)
  const snap = snapshots[currentEpoch]

  if (selectedNodeId === null || !snap) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-600">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-slate-800/50">
          <Search size={24} className="opacity-20 text-indigo-400" />
        </div>
        <p className="text-sm font-semibold text-slate-500">GNN Unified Inspector</p>
        <p className="text-[10px] mt-2 tracking-widest font-bold">CHỌN MỘT NÚT ĐỂ CHẨN ĐOÁN</p>
      </div>
    )
  }

  const node = graphData?.nodes?.find(n => n.id === selectedNodeId)
  const displayId = node?.original_id || selectedNodeId
  const taskName = {
    1: 'Phân loại nút', 2: 'Phân loại đồ thị', 3: 'Dự đoán liên kết',
    4: 'Phát hiện cộng đồng', 5: 'Biểu diễn đồ thị', 6: 'Sinh đồ thị'
  }[selectedTask]

  return (
    <div className="h-full flex flex-col bg-[#071120] animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="min-w-9 h-9 px-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 flex items-center justify-center text-cyan-400 border border-indigo-500/30 shadow-lg shadow-indigo-500/5">
            <span className="text-xs font-black truncate max-w-[60px]" title={displayId}>{displayId}</span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white leading-none mb-1">Node Inspector</h3>
            <div className="flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
               <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{taskName}</span>
            </div>
          </div>
        </div>
        <button onClick={() => setSelectedNode(null)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-all border border-transparent hover:border-slate-700">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-10">
        {selectedTask !== 3 && <NodeMetadataSection node={node} />}
        
        {selectedTask === 1 && (
          <Task1Inspector 
            node={node} snap={snap} snapshots={snapshots} 
            selectedNodeId={selectedNodeId} groundTruth={groundTruth} graphData={graphData}
          />
        )}
        {selectedTask === 3 && <Task3EdgeInspector />}
        {selectedTask === 5 && <Task5Inspector node={node} snap={snap} selectedNodeId={selectedNodeId} />}
      </div>

      <div className="px-4 py-2 border-t border-slate-800/40 bg-slate-900/10 text-[8px] text-slate-500 font-mono flex justify-between items-center">
        <span>STATUS: DIAGNOSTIC_ACTIVE</span>
        <span>EPOCH: {currentEpoch}</span>
      </div>
    </div>
  )
}
