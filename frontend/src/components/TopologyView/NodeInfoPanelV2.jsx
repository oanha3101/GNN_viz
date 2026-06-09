import { useMemo, useState } from 'react'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import useSessionStore from '../../store/sessionStore'
import { getClassColor, CLASS_NAMES } from '../../utils/colors'
import { computeKHopNeighbors, countNeighborsPerHop } from '../../utils/khop'
import NodeStoryTimeline from '../ResearchAnalyst/NodeStoryTimeline'

const resolveId = (value) => (typeof value === 'object' && value !== null ? value.id : value)

const confidenceCopy = (value) => {
  if (!Number.isFinite(value)) return ''
  if (value > 0.8) return 'Model rất tự tin với dự đoán này'
  if (value > 0.5) return 'Model khá tự tin, nhưng vẫn có nhiễu'
  return 'Model chưa chắc chắn, cần xem thêm ngữ cảnh'
}

export default function NodeInfoPanelV2() {
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const classNames = useGNNStore((s) => s.classNames)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const { snapshots, currentEpochFloat } = usePlayerStore()

  const currentEpoch = Math.floor(currentEpochFloat)
  const snapshot = snapshots[currentEpoch]
  const [showTimeline, setShowTimeline] = useState(false)
  const experimentId = useSessionStore((s) => s.experimentId)

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
      <div className="flex h-full flex-col items-center justify-center p-6 text-center lab-inspector-empty">
        <div className="mb-3 text-3xl opacity-50">◎</div>
        <p className="text-sm leading-6">Bấm vào một nút ở đồ thị để xem thông tin chi tiết.</p>
      </div>
    )
  }

  const gt = groundTruth[selectedNodeId]
  const pred = snapshot.node_predictions[selectedNodeId]
  const node = graphData?.nodes?.find((item) => item.id === selectedNodeId)
  const isCorrect = gt === pred
  const predictionToneClass = isCorrect ? 'lab-inspector-prediction-correct' : 'lab-inspector-prediction-wrong'
  const confidenceToneClass =
    !Number.isFinite(nodeConfidence) ? 'lab-inspector-confidence-idle'
      : nodeConfidence > 0.8 ? 'lab-inspector-confidence-high'
      : nodeConfidence > 0.5 ? 'lab-inspector-confidence-mid'
      : 'lab-inspector-confidence-low'

  return (
    <div className="lab-inspector-shell h-full overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="lab-inspector-kicker">Nút đang chọn</div>
          <h3 className="lab-inspector-title">
            {node?.original_id ? `Nút ${node.original_id}` : `Nút #${selectedNodeId}`}
          </h3>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="lab-inspector-dismiss rounded-xl px-3 py-2 text-xs"
        >
          Bỏ chọn
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="lab-inspector-card rounded-2xl p-4">
          <div className="lab-inspector-label mb-3">Nhãn thật</div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getClassColor(gt) }} />
            <span className="lab-inspector-value leading-tight">
              {node?.label_name || (classNames && classNames[gt]) || CLASS_NAMES[gt] || `Lớp ${gt}`}
            </span>
          </div>
        </div>
        <div className={`lab-inspector-card rounded-2xl p-4 ${predictionToneClass}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="lab-inspector-label">Dự đoán hiện tại</div>
            <span className={`lab-inspector-status-pill ${isCorrect ? 'lab-inspector-status-correct' : 'lab-inspector-status-wrong'}`}>
              {isCorrect ? 'Đúng' : 'Sai'}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: getClassColor(pred) }} />
            <span className="lab-inspector-value leading-tight">
              {(classNames && classNames[pred]) || CLASS_NAMES[pred] || `Lớp ${pred}`}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="lab-inspector-card lab-inspector-stat rounded-2xl p-4">
          <div className="lab-inspector-label">Bậc nút</div>
          <div className="lab-inspector-stat-value mt-2">{node?.degree || 0}</div>
        </div>
        <div className="lab-inspector-card lab-inspector-stat rounded-2xl p-4">
          <div className="lab-inspector-label">Tập dữ liệu</div>
          <div className="lab-inspector-stat-value mt-2">{node?.inTrainSet ? 'Train' : 'Kiểm tra'}</div>
        </div>
        <div className="lab-inspector-card lab-inspector-stat rounded-2xl p-4">
          <div className="lab-inspector-label">Epoch</div>
          <div className="lab-inspector-stat-value mt-2">{currentEpoch}</div>
        </div>
      </div>

      {/* Node Features */}
      {node?.features && (
        <div className="lab-inspector-card mt-4 rounded-2xl p-4">
          <div className="lab-inspector-label mb-3 flex items-center justify-between">
            <span>Đặc trưng (Features)</span>
            <span className="lab-inspector-inline-chip rounded px-1.5 py-0.5">
              {Array.isArray(node.features) ? node.features.length : Object.keys(node.features).length} dims
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
            {Object.entries(node.features || {}).map(([key, val], idx) => {
              return (
                <div 
                  key={key} 
                  className="lab-inspector-row flex items-center justify-between rounded px-2.5 py-2"
                >
                  <span className="lab-inspector-row-label mr-2 truncate" title={key}>{key}</span>
                  <span className="lab-inspector-mono-value font-mono">
                    {typeof val === 'number' ? val.toFixed(4) : val}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* K-Hop Neighborhood Stats */}
      {kHopStats && (
        <div className="lab-inspector-card mt-4 rounded-2xl p-4">
          <div className="lab-inspector-label mb-3">
            Vùng lân cận K-Hop
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="lab-inspector-hop-card lab-inspector-hop-card-1 rounded-xl p-3">
              <div className="lab-inspector-hop-label">1-Hop</div>
              <div className="lab-inspector-hop-value mt-1">{kHopStats.hop1}</div>
              <div className="lab-inspector-note text-[11px]">hàng xóm trực tiếp</div>
            </div>
            <div className="lab-inspector-hop-card lab-inspector-hop-card-2 rounded-xl p-3">
              <div className="lab-inspector-hop-label">2-Hop</div>
              <div className="lab-inspector-hop-value mt-1">{kHopStats.hop2}</div>
              <div className="lab-inspector-note text-[11px]">qua 1 nút trung gian</div>
            </div>
            <div className="lab-inspector-hop-card lab-inspector-hop-card-3 rounded-xl p-3">
              <div className="lab-inspector-hop-label">3-Hop</div>
              <div className="lab-inspector-hop-value mt-1">{kHopStats.hop3}</div>
              <div className="lab-inspector-note text-[11px]">qua 2 nút trung gian</div>
            </div>
            <div className="lab-inspector-hop-card lab-inspector-hop-card-total rounded-xl p-3">
              <div className="lab-inspector-hop-label">Tổng</div>
              <div className="lab-inspector-hop-value mt-1">{kHopStats.total}</div>
              <div className="lab-inspector-note text-[11px]">nút trong vùng ảnh hưởng</div>
            </div>
          </div>
          <div className="lab-inspector-note mt-3 italic">
            Thông tin lan truyền từ nút này qua {kHopStats.total} nút khác trong đồ thị
          </div>
        </div>
      )}

      {/* Decision Path Explanation */}
      {neighborContext && (
        <div className="lab-inspector-card mt-4 rounded-2xl p-4">
          <div className="lab-inspector-label mb-3">
            Giải thích dự đoán
          </div>
          
          {/* Prediction Summary */}
          <div className="lab-inspector-summary mb-3 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <span className={`text-lg font-bold ${isCorrect ? 'text-emerald-500' : 'text-amber-500'}`}>{isCorrect ? '✓' : '!'}</span>
              <div className="flex-1">
                <div className="lab-inspector-summary-title">
                  Nút #{selectedNodeId} → {CLASS_NAMES[pred] || `Lớp ${pred}`}
                  {nodeConfidence != null && (
                    <span className="lab-inspector-note ml-2 text-[11px] font-normal">
                      ({(nodeConfidence * 100).toFixed(1)}% confidence)
                    </span>
                  )}
                </div>
                {!isCorrect && (
                  <div className="mt-1 text-[11px] text-rose-500">
                    Sai! Ground truth: {CLASS_NAMES[gt] || `Lớp ${gt}`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Neighbor Influence */}
          {neighborContext.majority_class >= 0 && (
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="lab-inspector-row-label">Hàng xóm:</span>
                <span className="lab-inspector-row-value">
                  {neighborContext.total_neighbors} nút kề
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="lab-inspector-row-label">Đa số:</span>
                <span className="lab-inspector-row-value" style={{ color: 'var(--c-primary)' }}>
                  {(neighborContext.majority_ratio * 100).toFixed(0)}% là {CLASS_NAMES[neighborContext.majority_class] || `Lớp ${neighborContext.majority_class}`}
                </span>
              </div>
              
              {/* Explanation */}
              <div className="lab-inspector-callout mt-2 rounded-lg p-3 text-[12px] leading-relaxed">
                {(() => {
                  const predMatchesMajority = pred === neighborContext.majority_class
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
          {nodeConfidence != null && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="lab-inspector-row-label">Model confidence</span>
                <span className={`lab-inspector-mono-value font-bold ${confidenceToneClass}`}>
                  {(nodeConfidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="lab-inspector-prob-track h-2.5 rounded-full">
                <div
                  className={`h-full rounded-full transition-all ${confidenceToneClass}`}
                  style={{
                    width: `${nodeConfidence * 100}%`,
                  }}
                />
              </div>
              <div className="lab-inspector-note mt-1">
                {confidenceCopy(nodeConfidence)}
              </div>
            </div>
          )}
        </div>
      )}

      {probs && (
        <div className="lab-inspector-card mt-4 rounded-2xl p-4">
          <div className="lab-inspector-label mb-3">Phân bố xác suất</div>
          <div className="space-y-2">
            {probs.map((value, idx) => (
              <div key={idx} className={`flex items-center gap-3 text-xs ${idx === pred ? 'lab-inspector-prob-active' : ''}`}>
                <span className="lab-inspector-row-label w-12">{`Lớp ${idx}`}</span>
                <div className="lab-inspector-prob-track h-2.5 flex-1 rounded-full">
                  <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, backgroundColor: getClassColor(idx) }} />
                </div>
                <span className="lab-inspector-mono-value w-14 text-right">{(value * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node Story Timeline */}
      {experimentId && snapshots.length > 5 && (
        <div className="mt-4">
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="lab-inspector-card w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="lab-inspector-label" style={{ color: 'var(--c-primary)' }}>
                Prediction Timeline
              </span>
              <span className="lab-inspector-note text-[11px]">
                How this node's prediction evolved across epochs
              </span>
            </div>
            <span className="text-xs" style={{ color: 'var(--c-primary)' }}>
              {showTimeline ? '▲' : '▼'}
            </span>
          </button>
          {showTimeline && (
            <div className="lab-inspector-card mt-2 rounded-2xl p-4">
              <NodeStoryTimeline
                experimentId={experimentId}
                nodeId={selectedNodeId}
                graphData={graphData}
              />
            </div>
          )}
        </div>
      )}

      <div className="lab-inspector-card mt-4 rounded-2xl p-4">
        <div className="lab-inspector-label mb-3">
          {selectedModel === 'GAT' ? 'Hàng xóm được chú ý nhiều nhất' : 'Các nút lân cận'}
        </div>
        {topNeighbors.length === 0 ? (
          <div className="lab-inspector-note text-sm">Chưa có dữ liệu hàng xóm để hiển thị.</div>
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
                  className="lab-inspector-neighbor-card flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:scale-[1.01]"
                  style={{
                    borderColor: `${neighborColor}30`,
                    backgroundColor: `${neighborColor}12`,
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
                      <span className="lab-inspector-value text-sm">Nút {neighbor.id}</span>
                      {neighborClass !== undefined && (
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${neighborColor}20`, color: neighborColor }}>
                          {CLASS_NAMES[neighborClass] || `Lớp ${neighborClass}`}
                        </span>
                      )}
                    </div>
                    {selectedModel === 'GAT' && (
                      <div className="lab-inspector-prob-track mt-1.5 h-1.5 rounded-full">
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
