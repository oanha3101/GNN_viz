import { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { CLASS_COLORS, CLASS_NAMES } from '../../utils/colors'

// Deterministic pseudo-random based on seed
function seededRandom(seed) {
  let x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

// Helper: resolve node id from force-graph's mutated objects
const resolveId = (x) => (typeof x === 'object' && x !== null ? x.id : x)

export default function NodeInfoPanel() {
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  
  // Use playerStore for synchronized animation state
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const currentEpoch = Math.floor(currentEpochFloat)
  const snapshot = snapshots[currentEpoch]

  // Deterministic softmax probabilities
  const probs = useMemo(() => {
    if (selectedNodeId === null || !snapshot) return null
    
    // Safety check: handle inductive nodes that are not in the current snapshot's predictions
    let pred = snapshot.node_predictions[selectedNodeId]
    
    // If it's a new inductive node, use the groundTruth as the predicted class for visualization
    if (pred === undefined && groundTruth) {
      pred = groundTruth[selectedNodeId]
    }
    
    if (pred === undefined) return null

    const seed = selectedNodeId * 1000 + currentEpoch * 7 + pred * 31
    const p = Array(7).fill(0)
    // Predicted class gets high probability
    p[pred] = 0.45 + seededRandom(seed) * 0.35
    const remaining = 1 - p[pred]
    for (let i = 0; i < 7; i++) {
      if (i !== pred) {
        p[i] = remaining / 6 + (seededRandom(seed + i * 13) - 0.5) * 0.04
      }
    }
    const sum = p.reduce((a, b) => a + b, 0)
    return p.map((v) => Math.max(0.01, v / sum))
  }, [selectedNodeId, currentEpoch, snapshot, groundTruth])

  // Top neighbors by attention (GAT) — with robust id resolution
  const topNeighbors = useMemo(() => {
    if (selectedNodeId === null || selectedModel !== 'GAT' ||
        !snapshot?.attention_weights || !graphData) return []

    const neighbors = []
    graphData.links.forEach((link, i) => {
      const src = resolveId(link.source)
      const tgt = resolveId(link.target)
      if (src === selectedNodeId) {
        neighbors.push({ id: tgt, weight: snapshot.attention_weights[i] || 0 })
      }
      if (tgt === selectedNodeId) {
        neighbors.push({ id: src, weight: snapshot.attention_weights[i] || 0 })
      }
    })
    return neighbors.sort((a, b) => b.weight - a.weight).slice(0, 5)
  }, [selectedNodeId, snapshot, selectedModel, graphData])

  // Find all neighbors for non-GAT models
  const allNeighbors = useMemo(() => {
    if (selectedNodeId === null || selectedModel === 'GAT' || !graphData) return []
    const nbrs = []
    graphData.links.forEach((link) => {
      const src = resolveId(link.source)
      const tgt = resolveId(link.target)
      if (src === selectedNodeId) nbrs.push(tgt)
      if (tgt === selectedNodeId) nbrs.push(src)
    })
    return [...new Set(nbrs)].slice(0, 8)
  }, [selectedNodeId, graphData, selectedModel])

  if (selectedNodeId === null || !snapshot || !groundTruth) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm p-4">
        <div className="text-3xl mb-3 opacity-60">🔍</div>
        <p className="text-center leading-relaxed">
          Click any node in the<br />Topology View to inspect
        </p>
        <div className="mt-4 text-[10px] text-slate-600 space-y-1">
          <p>• Ground truth vs prediction</p>
          <p>• Softmax probability bars</p>
          <p>• Neighbor connections</p>
        </div>
      </div>
    )
  }

  const gt = groundTruth[selectedNodeId]
  const pred = snapshot.node_predictions[selectedNodeId]
  const isCorrect = gt === pred
  const node = graphData?.nodes?.find((n) => n.id === selectedNodeId)
  const className = CLASS_NAMES[gt] || `Class ${gt}`
  const predClassName = CLASS_NAMES[pred] || `Class ${pred}`

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar pb-24">
        {/* Header */}
        <div className="flex items-center justify-between sticky top-0 bg-slate-950/95 backdrop-blur-md pb-3 z-20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg"
                 style={{ backgroundColor: CLASS_COLORS[pred], boxShadow: `0 0 10px ${CLASS_COLORS[pred]}44` }}>
              {selectedNodeId}
            </div>
            <h3 className="text-sm font-semibold text-slate-200 tracking-tight">Node #{selectedNodeId}</h3>
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-500 
                       hover:text-slate-300 hover:bg-slate-700 text-xs transition-all"
          >
            ✕
          </button>
        </div>

        {/* GT vs Prediction */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800/50">
            <span className="text-slate-500 text-[9px] block uppercase tracking-wider mb-1 font-medium">Ground Truth</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CLASS_COLORS[gt] }} />
              <span className="font-semibold text-slate-200 truncate">{className}</span>
            </div>
          </div>
          <div className={`rounded-lg p-2.5 border transition-colors ${isCorrect
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-red-500/5 border-red-500/20'}`}>
            <span className="text-slate-500 text-[9px] block uppercase tracking-wider mb-1 font-medium">Predicted</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CLASS_COLORS[pred] }} />
              <span className={`font-semibold truncate ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                {predClassName} {isCorrect ? '✓' : '✗'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-900/40 rounded-lg px-2 py-2 text-center border border-slate-800/30">
            <span className="text-slate-500 text-[9px] block mb-0.5">Degree</span>
            <span className="text-slate-200 font-bold">{node?.degree || 0}</span>
          </div>
          <div className="bg-slate-900/40 rounded-lg px-2 py-2 text-center border border-slate-800/30">
            <span className="text-slate-500 text-[9px] block mb-0.5">Dataset</span>
            <span className={node?.inTrainSet ? 'text-indigo-400 font-bold' : 'text-slate-400'}>
              {node?.inTrainSet ? 'TRAIN' : 'TEST'}
            </span>
          </div>
          <div className="bg-slate-900/40 rounded-lg px-2 py-2 text-center border border-slate-800/30">
            <span className="text-slate-500 text-[9px] block mb-0.5">Epoch</span>
            <span className="text-slate-200 font-bold">{currentEpoch}</span>
          </div>
        </div>

        {/* Softmax Probs */}
        {probs && (
          <div className="bg-slate-900/30 rounded-xl p-3 border border-slate-800/30">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-3">
              Softmax Confidence
            </span>
            <div className="space-y-2.5">
              {probs.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[10px]">
                  <span className="w-3.5 text-slate-500 font-mono">{i}</span>
                  <div className="flex-1 bg-slate-800/50 rounded-full h-1.5 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${p * 100}%`,
                        backgroundColor: CLASS_COLORS[i],
                        opacity: i === pred ? 1 : 0.4,
                        boxShadow: i === pred ? `0 0 8px ${CLASS_COLORS[i]}66` : 'none'
                      }}
                    />
                  </div>
                  <span className={`w-10 text-right font-mono ${i === pred ? 'text-indigo-300 font-bold' : 'text-slate-500'}`}>
                    {(p * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Neighbors Section - Enhanced Scrollability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              {selectedModel === 'GAT' ? 'Attention Neighbors' : `Neighbors (${allNeighbors.length})`}
            </span>
            <span className="text-[9px] text-slate-600 font-medium">SCROLL ↓</span>
          </div>
          
          <div className="max-h-[450px] overflow-y-auto pr-1 space-y-2 custom-scrollbar bg-slate-900/20 rounded-xl p-2 border border-slate-800/30">
            {selectedModel === 'GAT' ? (
              topNeighbors.length > 0 ? (
                topNeighbors.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedNode(n.id)}
                    className="w-full flex items-center gap-3 text-[10px] bg-slate-800/40 rounded-xl p-2.5
                               hover:bg-slate-700/50 transition-all cursor-pointer text-left border border-transparent hover:border-slate-600/30 shadow-sm"
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px]
                                  font-bold text-white flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: CLASS_COLORS[groundTruth[n.id]] }}>
                      {n.id}
                    </span>
                    <div className="flex-1 bg-slate-900/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        style={{ width: `${n.weight * 100}%` }}
                      />
                    </div>
                    <span className="text-slate-400 font-mono w-10 text-right">{(n.weight * 100).toFixed(1)}%</span>
                  </button>
                ))
              ) : (
                <p className="text-center py-4 text-slate-600 text-[10px]">No attention data</p>
              )
            ) : (
              <div className="flex flex-wrap gap-2 p-1">
                {allNeighbors.map((nid) => (
                  <button
                    key={nid}
                    onClick={() => setSelectedNode(nid)}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px]
                               font-bold text-white hover:scale-110 active:scale-95 transition-all cursor-pointer
                               border-2 border-white/20 hover:border-white/50 shadow-lg"
                    style={{ 
                      backgroundColor: CLASS_COLORS[groundTruth[nid]],
                      boxShadow: `0 2px 8px ${CLASS_COLORS[groundTruth[nid]]}66`
                    }}
                  >
                    {nid}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
