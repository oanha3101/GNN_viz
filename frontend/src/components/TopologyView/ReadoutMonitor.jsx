import { useMemo, useRef, useState, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, interpolateSnapshots, lerpColor } from '../../engine/interpolate'

const GRAPH_LABELS = ['Dense', 'Sparse']

export default function ReadoutMonitor() {
  const hoveredGraphId = useGNNStore((s) => s.hoveredGraphId)
  const selectedNodeId = useGNNStore((s) => s.selectedNodeId)
  const taskData = useGNNStore((s) => s.taskData)
  
  // Use playerStore for synchronized animation state
  const { snapshots, currentEpochFloat } = usePlayerStore()
  
  // Support both hover and click selections
  const activeGraphId = hoveredGraphId !== null ? hoveredGraphId : selectedNodeId
  
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const t = easeInOutCubic(Math.max(0, Math.min(1, currentEpochFloat - epochInt)))
  const snapA = snapshots[epochInt]
  const snapB = snapshots[epochInt + 1] || snapA
  
  const currSnap = useMemo(() => {
    if (!snapA) return null
    return interpolateSnapshots(snapA, snapB, t)
  }, [snapA, snapB, t])

  const fgRef = useRef(null)
  
  const graph = useMemo(() => {
    if (activeGraphId === null || !taskData?.graphs) return null
    const g = taskData.graphs[activeGraphId]
    if (!g) return null
    return {
      ...g,
      nodes: g.nodes.map(n => ({ ...n })),
      links: g.links.map(l => ({ ...l }))
    }
  }, [activeGraphId, taskData])

  const containerRef = useRef(null)
  const [dim, setDim] = useState({ w: 200, h: 150 })

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDim({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const heatmapColors = useMemo(() => {
    if (!graph || !currSnap?.node_contributions) return {}
    const contribs = currSnap.node_contributions[activeGraphId] || []
    const map = {}
    graph.nodes.forEach((n, i) => {
      const score = Math.max(0, Math.min(1, contribs[i] || 0))
      // Multi-stop thermal scale
      if (score < 0.3) map[n.id] = lerpColor('#334155', '#ea580c', score / 0.3)
      else if (score < 0.7) map[n.id] = lerpColor('#ea580c', '#facc15', (score - 0.3) / 0.4)
      else map[n.id] = lerpColor('#facc15', '#ffffff', (score - 0.7) / 0.3)
    })
    return map
  }, [graph, currSnap, activeGraphId])

  if (activeGraphId === null || snapshots.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-[10px] p-4 bg-slate-950">
        <div className="text-3xl mb-3 opacity-40 animate-pulse">📡</div>
        <p className="text-center leading-relaxed">
          Hover a point in Embedding Space<br/>to analyze GNN Readout focus
        </p>
      </div>
    )
  }

  if (!graph) return null

  const gtLabel = GRAPH_LABELS[graph.groundTruth] || 'Unknown'
  const predRaw = currSnap?.graph_predictions?.[activeGraphId]
  const isCorrect = predRaw === graph.groundTruth
  const predLabel = predRaw !== undefined ? GRAPH_LABELS[predRaw] : 'Analyzing'

  return (
    <div className="h-full flex flex-col p-3 text-xs w-full relative bg-slate-950">
      <div className="mb-3 space-y-1.5 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Readout Analysis</h3>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isCorrect ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {isCorrect ? '✓ MATCHED' : '✗ FAULT'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">UNIT #{activeGraphId}</span>
        </div>
        <div className="flex gap-2 text-[9px]">
          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">GT: <b className="text-slate-200">{gtLabel}</b></span>
          <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400">PRED: <b className={isCorrect ? 'text-green-400' : 'text-red-400'}>{predLabel}</b></span>
        </div>
      </div>
      
      <div ref={containerRef} className="flex-1 min-h-[140px] relative bg-slate-900/30 rounded-xl overflow-hidden border border-slate-800/50 shadow-inner">
        <ForceGraph2D
          width={dim.w}
          height={dim.h}
          graphData={graph}
          nodeColor={(n) => heatmapColors[n.id] || '#475569'}
          nodeRelSize={7}
          linkColor={() => 'rgba(148,163,184,0.1)'}
          linkWidth={1}
          backgroundColor="transparent"
          cooldownTicks={60}
          d3VelocityDecay={0.6}
          enableZoomInteraction={false}
          enablePanInteraction={false}
          onEngineStop={() => {
            if (fgRef.current) fgRef.current.zoomToFit(200, 20)
          }}
          ref={fgRef}
        />
      </div>

      <div className="mt-3 space-y-1.5 z-10">
        <div className="flex justify-between text-[8px] font-bold text-slate-500 uppercase tracking-widest">
          <span>Cold Features</span>
          <span>Hot Features</span>
        </div>
        <div className="h-1.5 rounded-full bg-gradient-to-r from-slate-800 via-orange-600 to-yellow-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]" />
        <p className="text-[8px] text-slate-600 italic leading-tight mt-1">
          Bright nodes represent the structural elements GNN prioritized for this classification.
        </p>
      </div>
    </div>
  )
}
