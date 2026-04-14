import { useMemo } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { getClassColor, CLASS_NAMES } from '../../utils/colors'
import { computeKHopNeighbors, countNeighborsPerHop } from '../../utils/khop'

const resolveId = (value) => (typeof value === 'object' && value !== null ? value.id : value)

export default function NodeInfoPanelV2() {
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const currentEpoch = Math.floor(currentEpochFloat)
  const snapshot = snapshots[currentEpoch]

  // Use REAL probabilities from backend if available, fallback to synthetic
  const probs = useMemo(() => {
    if (selectedNodeId === null || !snapshot?.node_predictions) return null
    
    // Try to get real probabilities from backend
    if (snapshot.node_probabilities && snapshot.node_probabilities[selectedNodeId]) {
      return snapshot.node_probabilities[selectedNodeId]
    }
    
    // Fallback to synthetic if backend data not available
    const pred = snapshot.node_predictions[selectedNodeId]
    if (pred === undefined) return null
    const gtVal = groundTruth ? groundTruth[selectedNodeId] : 0
    const maxGtClass = groundTruth ? Math.max(...(Array.isArray(groundTruth) ? groundTruth : Object.values(groundTruth))) : 6
    const classCount = Math.max(7, maxGtClass + 1, gtVal + 1, pred + 1)
    const values = Array.from({ length: classCount }, (_, idx) => (idx === pred ? 0.68 : 0.32 / Math.max(1, classCount - 1)))
    return values
  }, [selectedNodeId, snapshot, groundTruth])

  // Node confidence from backend
  const nodeConfidence = useMemo(() => {
    if (selectedNodeId === null || !snapshot?.node_confidence) return null
    return snapshot.node_confidence[selectedNodeId]
  }, [selectedNodeId, snapshot])

  // Node correctness from backend
  const nodeCorrect = useMemo(() => {
    if (selectedNodeId === null || !snapshot?.node_correctness) return null
    return snapshot.node_correctness[selectedNodeId] === 1
  }, [selectedNodeId, snapshot])

  // Neighbor context from backend
  const neighborContext = useMemo(() => {
    if (selectedNodeId === null || !snapshot?.neighbor_majority) return null
    return snapshot.neighbor_majority[selectedNodeId] || null
  }, [selectedNodeId, snapshot])

  const topNeighbors = useMemo(() => {
    if (selectedNodeId === null || !graphData) return []
    const neighbors = []
    graphData.links.forEach((link, idx) => {
      const src = resolveId(link.source)
      const tgt = resolveId(link.target)
      if (src === selectedNodeId) {
        neighbors.push({ id: tgt, weight: snapshot?.attention_weights?.[idx] ?? 0 })
      }
      if (tgt === selectedNodeId) {
        neighbors.push({ id: src, weight: snapshot?.attention_weights?.[idx] ?? 0 })
      }
    })
    return neighbors.sort((a, b) => b.weight - a.weight).slice(0, 8)
  }, [selectedNodeId, graphData, snapshot])

  // K-Hop neighborhood statistics
  const kHopStats = useMemo(() => {
    if (selectedNodeId === null || !graphData?.links) return null
    const neighbors = computeKHopNeighbors(selectedNodeId, graphData.links, 3)
    const counts = countNeighborsPerHop(neighbors, 3)
    return {
      hop1: counts[0],
      hop2: counts[1],
      hop3: counts[2],
      total: neighbors.size - 1 // Exclude the node itself
    }
  }, [selectedNodeId, graphData])

  if (selectedNodeId === null || !snapshot || !groundTruth) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
        <div className="mb-3 text-3xl opacity-50">◎</div>
        <p className="text-sm leading-6">Bấm vào một nút ở đồ thị để xem thông tin chi tiết.</p>
      </div>
    )
  }

  const gt = groundTruth[selectedNodeId]
  const pred = snapshot.node_predictions[selectedNodeId]
  const node = graphData?.nodes?.find((item) => item.id === selectedNodeId)
  const isCorrect = gt === pred

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Nút đang chọn</div>
          <h3 className="text-lg font-semibold text-white">Nút #{selectedNodeId}</h3>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="rounded-xl border border-slate-700/50 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
        >
          Bỏ chọn
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Nhãn thật</div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getClassColor(gt) }} />
            <span className="text-sm text-slate-100">{CLASS_NAMES[gt] || `Lớp ${gt}`}</span>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${isCorrect ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-red-500/30 bg-red-500/8'}`}>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">Dự đoán hiện tại</div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getClassColor(pred) }} />
            <span className={`text-sm ${isCorrect ? 'text-emerald-300' : 'text-red-300'}`}>
              {CLASS_NAMES[pred] || `Lớp ${pred}`} {isCorrect ? 'đúng' : 'sai'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Bậc nút</div>
          <div className="mt-1 text-lg font-semibold text-white">{node?.degree || 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Tập dữ liệu</div>
          <div className="mt-1 text-lg font-semibold text-white">{node?.inTrainSet ? 'Train' : 'Kiểm tra'}</div>
        </div>
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Epoch</div>
          <div className="mt-1 text-lg font-semibold text-white">{currentEpoch}</div>
        </div>
      </div>

      {/* K-Hop Neighborhood Stats */}
      {kHopStats && (
        <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Vùng lân cận K-Hop
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
              <div className="text-[9px] text-cyan-400 uppercase tracking-wider">1-Hop</div>
              <div className="mt-1 text-2xl font-bold text-cyan-300">{kHopStats.hop1}</div>
              <div className="text-[8px] text-slate-500">hàng xóm trực tiếp</div>
            </div>
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
              <div className="text-[9px] text-purple-400 uppercase tracking-wider">2-Hop</div>
              <div className="mt-1 text-2xl font-bold text-purple-300">{kHopStats.hop2}</div>
              <div className="text-[8px] text-slate-500">qua 1 nút trung gian</div>
            </div>
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
              <div className="text-[9px] text-yellow-400 uppercase tracking-wider">3-Hop</div>
              <div className="mt-1 text-2xl font-bold text-yellow-300">{kHopStats.hop3}</div>
              <div className="text-[8px] text-slate-500">qua 2 nút trung gian</div>
            </div>
            <div className="rounded-xl border border-slate-600/30 bg-slate-600/5 p-3">
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Tổng</div>
              <div className="mt-1 text-2xl font-bold text-slate-300">{kHopStats.total}</div>
              <div className="text-[8px] text-slate-500">nút trong vùng ảnh hưởng</div>
            </div>
          </div>
          <div className="mt-3 text-[8px] text-slate-600 italic">
            Thông tin lan truyền từ nút này qua {kHopStats.total} nút khác trong đồ thị
          </div>
        </div>
      )}

      {/* Decision Path Explanation */}
      {neighborContext && (
        <div className="mt-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-indigo-400">
            Giải thích dự đoán
          </div>
          
          {/* Prediction Summary */}
          <div className="mb-3 rounded-xl bg-slate-900/50 p-3">
            <div className="flex items-start gap-2">
              <span className={`text-lg font-bold ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>{isCorrect ? '✓' : '!'}</span>
              <div className="flex-1">
                <div className="text-xs font-semibold text-white">
                  Nút #{selectedNodeId} → {CLASS_NAMES[pred] || `Lớp ${pred}`}
                  {nodeConfidence && (
                    <span className="ml-2 text-[10px] font-normal text-slate-400">
                      ({(nodeConfidence * 100).toFixed(1)}% confidence)
                    </span>
                  )}
                </div>
                {!isCorrect && (
                  <div className="mt-1 text-[9px] text-red-400">
                    Sai! Ground truth: {CLASS_NAMES[gt] || `Lớp ${gt}`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Neighbor Influence */}
          {neighborContext.majority_class >= 0 && (
            <div className="space-y-2 text-[10px]">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Hàng xóm:</span>
                <span className="text-white">
                  {neighborContext.total_neighbors} nút kề
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Đa số:</span>
                <span className="text-cyan-300">
                  {(neighborContext.majority_ratio * 100).toFixed(0)}% là {CLASS_NAMES[neighborContext.majority_class] || `Lớp ${neighborContext.majority_class}`}
                </span>
              </div>
              
              {/* Explanation */}
              <div className="mt-2 rounded-lg bg-slate-800/50 p-2 text-[9px] text-slate-300 leading-relaxed">
                {(() => {
                  const predMatchesMajority = pred === neighborContext.majority_class
                  const isHighConfidence = nodeConfidence && nodeConfidence > 0.8
                  const isLowConfidence = nodeConfidence && nodeConfidence < 0.5
                  
                  if (isCorrect && predMatchesMajority) {
                    return `✓ Dự đoán đúng! Model dựa vào cấu trúc hàng xóm (${(neighborContext.majority_ratio * 100).toFixed(0)}% là ${CLASS_NAMES[pred] || `Lớp ${pred}`}) để phân loại nút này.`
                  } else if (isCorrect && !predMatchesMajority) {
                    return `✓ Dự đoán đúng dù khác với hàng xóm! Model có thể dựa vào features của nút thay vì cấu trúc đồ thị.`
                  } else if (!isCorrect && predMatchesMajority) {
                    return `⚠ Sai! Model bị ảnh hưởng bởi hàng xóm (${(neighborContext.majority_ratio * 100).toFixed(0)}% là ${CLASS_NAMES[neighborContext.majority_class] || `Lớp ${neighborContext.majority_class}`}), nhưng ground truth là ${CLASS_NAMES[gt] || `Lớp ${gt}`}. Đây có thể là node "bridge" giữa các cộng đồng.`
                  } else {
                    return `⚠ Sai! Model không dựa đúng vào hàng xóm. Confidence ${nodeConfidence ? (nodeConfidence * 100).toFixed(1) : 'N/A'}% cho thấy model ${isLowConfidence ? 'không chắc chắn' : 'quá tự tin dù sai'}.`
                  }
                })()}
              </div>
            </div>
          )}

          {/* Confidence Indicator */}
          {nodeConfidence && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[9px]">
                <span className="text-slate-500">Model confidence</span>
                <span className="font-mono font-bold" style={{ color: nodeConfidence > 0.8 ? '#4ade80' : nodeConfidence > 0.5 ? '#facc15' : '#f87171' }}>
                  {(nodeConfidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${nodeConfidence * 100}%`,
                    backgroundColor: nodeConfidence > 0.8 ? '#4ade80' : nodeConfidence > 0.5 ? '#facc15' : '#f87171',
                  }}
                />
              </div>
              <div className="mt-1 text-[8px] text-slate-600">
                {nodeConfidence > 0.8 ? 'Model rất tự tin với dự đoán này' :
                 nodeConfidence > 0.5 ? 'Model khá tự tin, nhưng có thể có nhiễu' :
                 'Model không chắc chắn - decision boundary mờ'}
              </div>
            </div>
          )}
        </div>
      )}

      {probs && (
        <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">Phân bố xác suất</div>
          <div className="space-y-2">
            {probs.map((value, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-12 text-slate-400">{`Lớp ${idx}`}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${value * 100}%`, backgroundColor: getClassColor(idx) }} />
                </div>
                <span className="w-12 text-right font-mono text-slate-300">{(value * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-slate-700/40 bg-slate-900/70 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {selectedModel === 'GAT' ? 'Hàng xóm được chú ý nhiều nhất' : 'Các nút lân cận'}
        </div>
        {topNeighbors.length === 0 ? (
          <div className="text-sm text-slate-500">Chưa có dữ liệu hàng xóm để hiển thị.</div>
        ) : (
          <div className="space-y-2">
            {topNeighbors.map((neighbor) => {
              const neighborClass = groundTruth?.[neighbor.id]
              const neighborColor = neighborClass !== undefined ? getClassColor(neighborClass) : '#64748b'
              const neighborPred = snapshot?.node_predictions?.[neighbor.id]
              const neighborCorrect = neighborClass !== undefined && neighborClass === neighborPred
              return (
                <button
                  key={neighbor.id}
                  onClick={() => setSelectedNode(neighbor.id)}
                  className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all hover:scale-[1.01] hover:shadow-md"
                  style={{
                    borderColor: `${neighborColor}30`,
                    backgroundColor: `${neighborColor}0A`,
                  }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: neighborColor }}
                  >
                    {neighbor.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-200">Nút {neighbor.id}</span>
                      {neighborClass !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${neighborColor}20`, color: neighborColor }}>
                          {CLASS_NAMES[neighborClass] || `Lớp ${neighborClass}`}
                        </span>
                      )}
                    </div>
                    {selectedModel === 'GAT' && (
                      <div className="mt-1.5 h-1.5 rounded-full bg-slate-800">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(6, neighbor.weight * 100)}%`, backgroundColor: neighborColor }} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {neighborCorrect !== undefined && (
                      <span className={`text-[10px] ${neighborCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                        {neighborCorrect ? '✓' : '✗'}
                      </span>
                    )}
                    {selectedModel === 'GAT' && <span className="text-xs font-mono" style={{ color: neighborColor }}>{(neighbor.weight * 100).toFixed(1)}%</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
