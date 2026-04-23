import { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { getClassColor, CLASS_NAMES } from '../../utils/colors'

// Calculate L2 distance between two arrays
const l2Distance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

export default function Task5NodeInspector() {
  const selectedNodeId = useGNNStore(s => s.selectedNodeId)
  const setSelectedNode = useGNNStore(s => s.setSelectedNode)
  const graphData = useGNNStore(s => s.graphData)
  const graphMeta = useGNNStore(s => s.task5Meta)
  
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const currentEpoch = Math.floor(currentEpochFloat)
  const snap = snapshots[currentEpoch]
  
  const hasLabels = graphMeta?.has_labels || false

  // Find base graph neighbors
  const topGraphNeighbors = useMemo(() => {
    if (selectedNodeId === null || !graphData?.links) return []
    const neighbors = []
    graphData.links.forEach(link => {
      const src = typeof link.source === 'object' ? link.source.id : link.source
      const tgt = typeof link.target === 'object' ? link.target.id : link.target
      if (src === selectedNodeId) neighbors.push(tgt)
      if (tgt === selectedNodeId) neighbors.push(src)
    })
    return [...new Set(neighbors)]
  }, [selectedNodeId, graphData])

  // Find Top-5 Embedding Neighbors
  const topEmbeddingNeighbors = useMemo(() => {
    const Z = snap?.pca_2d || snap?.embeddings_2d
    if (selectedNodeId === null || !Z) return []
    
    const sourceEmb = Z[selectedNodeId]
    if (!sourceEmb) return []

    // Calculate distance to all other nodes
    const distances = []
    for (let i = 0; i < Z.length; i++) {
      if (i === selectedNodeId) continue
      const dist = l2Distance(sourceEmb, Z[i])
      distances.push({ id: i, dist: dist })
    }

    // Sort by smallest distance and take top 5
    distances.sort((a, b) => a.dist - b.dist)
    return distances.slice(0, 5)
  }, [selectedNodeId, snap])

  if (selectedNodeId === null || !snap) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm p-4 text-center">
        <div className="text-3xl mb-3 opacity-60">&#128269;</div>
        <p className="leading-relaxed">Bấm vào bất kỳ Nút nào ở đồ thị để<br/>xem chi tiết Đặc trưng Cấu trúc</p>
      </div>
    )
  }

  const node = graphData?.nodes?.find(n => n.id === selectedNodeId)
  const degree = node?.degree || topGraphNeighbors.length
  
  // Try to get class
  const gt = node?.groundTruth !== undefined ? node.groundTruth : null
  const pred = snap?.node_predictions?.[selectedNodeId]
  
  let gtColor = gt !== null ? getClassColor(gt) : '#475569'
  let predColor = pred !== undefined ? getClassColor(pred) : '#475569'
  
  return (
    <div className="h-full flex flex-col bg-slate-950 font-sans">
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar pb-10">
        
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 bg-slate-950/95 backdrop-blur-md pb-2 z-20 border-b border-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-micro font-bold text-white shadow-lg"
                 style={{ backgroundColor: predColor, boxShadow: `0 0 10px ${predColor}44` }}>
              {selectedNodeId}
            </div>
            <h3 className="text-sm font-semibold text-slate-200 tracking-tight">Node #{selectedNodeId}</h3>
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700 text-xs transition-all"
          >&#10005;</button>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/30">
            <span className="text-slate-500 text-nano block uppercase tracking-wider mb-1 font-medium">Original Degree</span>
            <span className="text-slate-200 font-bold text-lg">{degree}</span>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2 border border-slate-800/30">
            <span className="text-slate-500 text-nano block uppercase tracking-wider mb-1 font-medium">Epoch</span>
            <span className="text-slate-200 font-bold text-lg">{currentEpoch}</span>
          </div>
        </div>

        {hasLabels && gt !== null && (
          <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50 flex items-center justify-between">
            <span className="text-slate-400 text-micro uppercase tracking-wider font-semibold">Nhãn gốc (GT)</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: gtColor }} />
              <span className="font-semibold text-slate-200 text-micro">{ CLASS_NAMES[gt] || `Class ${gt}` }</span>
            </div>
          </div>
        )}

        {/* Structural Comparison */}
        <div className="mt-4 pt-4 border-t border-slate-800/50 space-y-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest px-1 flex items-center gap-1.5">
            <span className="text-blue-400">&#9776;</span> So sánh Lân cận
          </h4>
          
          <div className="space-y-4">
            
            {/* Base Graph Neighbors */}
            <div className="bg-slate-900/30 rounded-xl p-2.5 border border-slate-800/30">
              <span className="text-nano text-slate-500 font-bold tracking-widest uppercase mb-2 block">
                Hàng xóm đồ thị gốc ({topGraphNeighbors.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {topGraphNeighbors.length > 0 ? topGraphNeighbors.map(nid => {
                  const nt = graphData?.nodes?.[nid]?.groundTruth
                  const color = hasLabels && nt !== undefined ? getClassColor(nt) : '#475569'
                  return (
                    <button key={`graph-${nid}`} onClick={() => setSelectedNode(nid)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-nano font-bold text-white transition-all hover:scale-110 shadow-md cursor-pointer border border-white/10"
                      style={{ backgroundColor: color }} title={`Xem Node ${nid}`}>
                      {nid}
                    </button>
                  )
                }) : <span className="text-slate-600 text-micro">Không có lân cận</span>}
              </div>
            </div>

            {/* Embedding Space Neighbors */}
            <div className="bg-blue-900/10 rounded-xl p-2.5 border border-blue-800/20">
              <span className="text-nano text-blue-400 font-bold tracking-widest uppercase mb-2 block">
                Top 5 gần nhất không gian nhúng
              </span>
              <div className="space-y-1.5">
                {topEmbeddingNeighbors.length > 0 ? topEmbeddingNeighbors.map((item, idx) => {
                  const nt = graphData?.nodes?.[item.id]?.groundTruth
                  const tp = snap?.node_predictions?.[item.id]
                  const color = hasLabels && nt !== undefined ? getClassColor(nt) : (tp !== undefined ? getClassColor(tp) : '#475569')
                  
                  // Highlight if this is ALSO a graph neighbor
                  const isAlsoGraphNeighbor = topGraphNeighbors.includes(item.id)

                  return (
                    <button key={`emb-${item.id}`} onClick={() => setSelectedNode(item.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all hover:bg-slate-800/80
                        ${isAlsoGraphNeighbor ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-800/30 border-transparent'}
                      `}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-nano font-bold text-white shadow-sm"
                            style={{ backgroundColor: color }}>
                        {item.id}
                      </span>
                      <div className="flex-1 flex flex-col">
                        <span className="text-micro text-slate-300 font-medium leading-none">Node {item.id}</span>
                        {isAlsoGraphNeighbor && <span className="text-nano text-cyan-400 font-semibold mt-0.5">✓ Có nối kết gốc</span>}
                      </div>
                      <span className="text-slate-500 font-mono text-nano">L2: {item.dist.toFixed(2)}</span>
                    </button>
                  )
                }) : <span className="text-slate-600 text-micro">Đang tính toán...</span>}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
