import React, { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_NAMES, CLASS_COLORS } from '../../utils/colors'

export default function Task3EdgeInspector() {
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const selectedTargetNodeId = useGNNStore(s => s.selectedTargetNodeId)
  const setSelectedTargetNode = useGNNStore(s => s.setSelectedTargetNode)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  
  const graphData = useGNNStore(s => s.graphData)
  const groundTruth = useGNNStore(s => s.groundTruth)
  const taskData = useGNNStore(s => s.taskData)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const currentEpoch = Math.floor(currentEpochFloat)
  const snapshot = snapshots[currentEpoch]

  const nodeStats = useMemo(() => {
    if (selectedNodeId === null || !graphData || !taskData?.testEdges) return null
    
    // Find all test edges involving this node
    const edges = []
    taskData.testEdges.forEach((te, i) => {
      if (te.source === selectedNodeId || te.target === selectedNodeId) {
        const targetId = te.source === selectedNodeId ? te.target : te.source
        const score = snapshot?.edge_scores?.[i] || 0
        const cls = snapshot?.edge_classifications?.[i] || {}
        const explain = snapshot?.test_edge_common_neighbors?.[i] || {}
        
        edges.push({
          targetId,
          score,
          exists: te.exists,
          classification: cls.classification || (te.exists ? (score > 0.5 ? 'TP' : 'FN') : (score > 0.5 ? 'FP' : 'TN')),
          commonNeighbors: explain.common_neighbors || 0,
          embDistance: explain.embedding_distance || 0
        })
      }
    })
    
    edges.sort((a, b) => b.score - a.score)
    
    return { edges }
  }, [selectedNodeId, graphData, taskData, snapshot])

  if (selectedNodeId === null || !snapshot || !graphData) return null

  const gt = groundTruth?.[selectedNodeId] || 0
  const nodeInfo = graphData.nodes.find(n => n.id === selectedNodeId)

  // ─── Pair Analysis Mode ───
  if (selectedTargetNodeId !== null) {
    const pairData = nodeStats?.edges.find(e => e.targetId === selectedTargetNodeId)
    if (!pairData) {
      // Might not be a test edge, just fallback
      return (
        <div className="h-full overflow-y-auto px-4 py-4">
           <button onClick={() => setSelectedTargetNode(null)} className="mb-4 text-xs font-bold text-slate-400 hover:text-white">← Quay lại danh sách</button>
           <div className="text-slate-400 text-xs">Cạnh này nằm trong tập huấn luyện, không có dữ liệu dự đoán để giải thích.</div>
        </div>
      )
    }

    const { score, exists, classification, commonNeighbors, embDistance } = pairData
    const isPredLink = score > 0.5

    // Explain thresholds
    let cnLevel = 'THẤP'; let cnColor = 'text-slate-400'
    if (commonNeighbors > 3) { cnLevel = 'CAO'; cnColor = 'text-green-400' }
    else if (commonNeighbors > 0) { cnLevel = 'TRUNG BÌNH'; cnColor = 'text-yellow-400' }

    let embLevel = 'GẦN'; let embColor = 'text-green-400'
    if (embDistance > 2.0) { embLevel = 'XA'; embColor = 'text-slate-400' }
    else if (embDistance > 0.8) { embLevel = 'TRUNG BÌNH'; embColor = 'text-yellow-400' }

    return (
      <div className="h-full overflow-y-auto px-4 py-4 bg-slate-950">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => setSelectedTargetNode(null)} className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition">
            ← TRỞ VỀ DANH SÁCH
          </button>
        </div>

        <div className="mb-4 text-center">
          <div className="flex justify-center items-center gap-3">
             <div className="flex flex-col items-center">
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs border-2 border-slate-700" style={{ backgroundColor: CLASS_COLORS[gt] || '#475569' }}>{selectedNodeId}</span>
             </div>
             <div className="flex-1 flex flex-col items-center">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isPredLink ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>{isPredLink ? 'CÓ KẾT NỐI' : 'KHÔNG KẾT NỐI'}</span>
                <span className="text-xl font-black text-white mt-1">{(score * 100).toFixed(1)}%</span>
             </div>
             <div className="flex flex-col items-center">
                <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs border-2 border-slate-700" style={{ backgroundColor: CLASS_COLORS[groundTruth?.[selectedTargetNodeId]] || '#475569' }}>{selectedTargetNodeId}</span>
             </div>
          </div>
          <div className={`mt-2 text-[10px] font-bold ${classification === 'TP' || classification === 'TN' ? 'text-green-400' : 'text-red-400'}`}>
            Thực tế: {exists ? 'CÓ LIÊN KẾT' : 'KHÔNG CÓ LIÊN KẾT'} ({classification})
          </div>
        </div>

        <div className="space-y-3 mt-6">
          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">GIẢI THÍCH MÔ HÌNH</div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-300">Bạn Chung (Common Neighbors)</span>
              <span className={`text-xs font-bold ${cnColor}`}>{commonNeighbors} ({cnLevel})</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">Số lượng bạn chung càng cao, hai node càng có khả năng nằm trong cùng một cụm và liên kết với nhau.</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-300">Khoảng cách Embedding</span>
              <span className={`text-xs font-bold ${embColor}`}>{embDistance.toFixed(2)} ({embLevel})</span>
            </div>
            <p className="text-[9px] text-slate-500 leading-relaxed">Khoảng cách trong không gian nhúng (Latent Space). Mô hình học cách kéo các node có liên kết lại gần nhau.</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
             <div className="text-[10px] text-slate-400 italic">
               {isPredLink ? 
                 `Mô hình dự đoán kết nối vì khoảng cách embedding ${embLevel.toLowerCase()} và số bạn chung ${cnLevel.toLowerCase()}.` : 
                 `Mô hình từ chối kết nối vì khoảng cách embedding ${embLevel.toLowerCase()} và thiếu bạn chung.`}
             </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Node Candidate List Mode ───
  return (
    <div className="h-full overflow-y-auto px-4 py-4 bg-slate-950">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Phân tích Liên kết</div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            Nút #{selectedNodeId}
            <span className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-300" style={{ color: CLASS_COLORS[gt] }}>{CLASS_NAMES[gt] || `Class ${gt}`}</span>
          </h3>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-[10px] font-bold tracking-wider text-slate-300 hover:bg-slate-800 uppercase"
        >
          Đóng
        </button>
      </div>

      <div className="text-[10px] text-slate-400 mb-4 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
        Bấm vào một ứng viên dưới đây để xem giải thích (Explainability) vì sao mô hình dự đoán có kết nối hay không.
      </div>

      <div className="space-y-4">
        {['TP', 'FP', 'FN', 'TN'].map(cls => {
          const clsEdges = nodeStats.edges.filter(e => e.classification === cls)
          if (clsEdges.length === 0) return null

          let title = ''; let color = ''; let bg = '';
          if (cls === 'TP') { title = 'Dự đoán CÓ (Đúng)'; color = 'text-green-400'; bg = 'bg-green-500/10 border-green-500/20' }
          if (cls === 'FP') { title = 'Dự đoán CÓ (Sai)'; color = 'text-red-400'; bg = 'bg-red-500/10 border-red-500/20' }
          if (cls === 'FN') { title = 'Dự đoán KHÔNG (Sai)'; color = 'text-yellow-400'; bg = 'bg-yellow-500/10 border-yellow-500/20' }
          if (cls === 'TN') { title = 'Dự đoán KHÔNG (Đúng)'; color = 'text-slate-400'; bg = 'bg-slate-800/40 border-slate-700/50' }

          return (
            <div key={cls}>
              <div className={`text-[9px] uppercase font-bold tracking-widest mb-1.5 pl-1 ${color}`}>{title}</div>
              <div className="space-y-1">
                {clsEdges.map(e => (
                  <button
                    key={e.targetId}
                    onClick={() => setSelectedTargetNode(e.targetId)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border hover:bg-slate-800/80 transition text-left ${bg}`}
                  >
                    <div className="flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-bold text-white border border-slate-700">{e.targetId}</div>
                       <span className="text-xs font-bold text-slate-200">{(e.score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="text-[9px] text-slate-500 flex gap-2">
                       <span>Bạn chung: <b className="text-slate-300">{e.commonNeighbors}</b></span>
                       <span>Dist: <b className="text-slate-300">{e.embDistance.toFixed(2)}</b></span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
