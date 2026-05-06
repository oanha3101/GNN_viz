import React, { useMemo } from 'react'
import usePlayerStore from '../../store/playerStore'
import LazyPlot from '../primitives/LazyPlot'

const COMMUNITY_COLORS = ['#3b82f6','#ef4444','#22c55e','#eab308','#a855f7','#06b6d4','#ec4899','#f97316']

/**
 * CommunityEvolution — Sprint 4
 * Shows how nodes migrate between communities across epochs using:
 *   1. Stacked area chart showing community size evolution
 *   2. Sankey-style flow diagram (Plotly) of community transitions
 */
export default function CommunityEvolution() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))

  // Build stacked area: community sizes over epochs
  const { areaData, numCommunities } = useMemo(() => {
    if (snapshots.length === 0) return { areaData: [], numCommunities: 0 }
    const allSizes = snapshots.map(s => s.community_sizes || [])
    const nC = Math.max(...allSizes.map(s => s.length), 0)
    const traces = Array.from({ length: nC }, (_, ci) => ({
      x: snapshots.map((_, i) => i),
      y: allSizes.map(s => s[ci] ?? 0),
      type: 'scatter',
      mode: 'lines',
      name: `C${ci}`,
      stackgroup: 'one',
      fillcolor: COMMUNITY_COLORS[ci % COMMUNITY_COLORS.length] + '88',
      line: { color: COMMUNITY_COLORS[ci % COMMUNITY_COLORS.length], width: 1.5 }
    }))
    return { areaData: traces, numCommunities: nC }
  }, [snapshots])

  // Accumulate transition flows (sum over recent epochs around current)
  const { flowSankey } = useMemo(() => {
    if (snapshots.length < 2 || numCommunities === 0) return { flowSankey: null }

    const windowStart = Math.max(1, epochInt - 5)
    const windowEnd = Math.min(snapshots.length - 1, epochInt + 5)
    const flowMap = {}
    for (let i = windowStart; i <= windowEnd; i++) {
      const t = snapshots[i]?.community_transitions || {}
      Object.entries(t).forEach(([key, count]) => {
        flowMap[key] = (flowMap[key] || 0) + count
      })
    }

    if (Object.keys(flowMap).length === 0) return { flowSankey: null }

    const nodeLabels = []
    const sources = []
    const targets = []
    const values = []
    const colors = []
    const srcIds = {}
    const dstIds = {}

    Object.entries(flowMap).forEach(([key, count]) => {
      const [fromStr, toStr] = key.split('->')
      const from = parseInt(fromStr)
      const to = parseInt(toStr)
      if (from === to || count < 1) return

      const srcLabel = `C${from} (từ)`
      const dstLabel = `C${to} (đến)`

      if (!(srcLabel in srcIds)) {
        srcIds[srcLabel] = nodeLabels.length
        nodeLabels.push(srcLabel)
      }
      if (!(dstLabel in dstIds)) {
        dstIds[dstLabel] = nodeLabels.length
        nodeLabels.push(dstLabel)
      }

      sources.push(srcIds[srcLabel])
      targets.push(dstIds[dstLabel])
      values.push(count)
      colors.push(COMMUNITY_COLORS[from % COMMUNITY_COLORS.length] + 'AA')
    })

    if (sources.length === 0) return { flowSankey: null }

    const nodeColors = nodeLabels.map((label) => {
      const cid = parseInt(label.replace(/[^0-9]/g, '')) || 0
      return COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]
    })

    return {
      flowSankey: [{
        type: 'sankey',
        orientation: 'h',
        node: {
          pad: 12,
          thickness: 18,
          line: { color: 'rgba(0,0,0,0.3)', width: 0.5 },
          label: nodeLabels,
          color: nodeColors,
          hovertemplate: '%{label}<br>%{value} nodes<extra></extra>'
        },
        link: {
          source: sources,
          target: targets,
          value: values,
          color: colors,
          hovertemplate: '%{source.label} → %{target.label}<br>%{value} nodes<extra></extra>'
        }
      }]
    }
  }, [snapshots, epochInt, numCommunities])

  const currentSizes = snapshots[epochInt]?.community_sizes || []
  const totalNodes = currentSizes.reduce((a, b) => a + b, 0)

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 overflow-hidden pt-7">
      {/* Header Info (Title is handled by App.jsx PanelHeading) */}
      <div className="px-3 pb-1 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Trạng thái</div>
            <div className="text-[8px] text-slate-500">Epoch {epochInt} · {numCommunities} cộng đồng · {totalNodes} nodes</div>
          </div>
        </div>
        
        {/* Horizontal Community Sizes List (to avoid covering chart) */}
        {snapshots.length > 0 && numCommunities > 0 && (
          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {currentSizes.map((size, ci) => {
              if (size === 0) return null;
              return (
                <div key={ci} className="flex items-center gap-1.5 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/30 whitespace-nowrap">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COMMUNITY_COLORS[ci % COMMUNITY_COLORS.length] }} />
                  <span className="text-[10px] font-mono text-slate-300 font-bold">C{ci}:</span>
                  <span className="text-[10px] font-mono font-black" style={{ color: COMMUNITY_COLORS[ci % COMMUNITY_COLORS.length] }}>
                    {size} <span className="text-[8px] text-slate-500 font-normal">nodes</span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Stacked area chart (Takes full height if no Sankey) */}
        <div className={`${flowSankey ? 'h-[50%] border-b border-slate-800/40' : 'flex-1'} shrink-0 relative flex flex-col transition-all duration-300`}>
          <div className="text-[8px] text-slate-600 uppercase tracking-widest font-bold px-3 pt-1 pb-0 shrink-0">
            Kích thước cộng đồng theo Epoch
          </div>
          
          <div className="flex-1 min-h-0">
            {areaData.length > 0 ? (
              <LazyPlot
                data={areaData}
                layout={{
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  margin: { l: 35, r: 10, t: 5, b: 25 },
                  xaxis: { color: '#475569', gridcolor: '#1e293b', zeroline: false, title: '' },
                  yaxis: { color: '#475569', gridcolor: '#1e293b', zeroline: false, title: '' },
                  showlegend: false,
                  shapes: [{
                    type: 'line', x0: epochInt, x1: epochInt, y0: 0, y1: 1,
                    xref: 'x', yref: 'paper',
                    line: { color: '#06b6d4', width: 1.5, dash: 'dot' }
                  }]
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-[10px] italic p-4">
                Dữ liệu kích thước cộng đồng sẽ xuất hiện sau 1 epoch
              </div>
            )}
          </div>
        </div>

        {/* Node migration Sankey (ONLY rendered if there is data) */}
        {flowSankey && (
          <div className="flex-1 min-h-0 flex flex-col relative fade-in">
            <div className="text-[8px] text-slate-600 uppercase tracking-widest font-bold px-3 pt-1.5 pb-0 shrink-0">
              Node Migration Flow (±5 epochs từ Epoch {epochInt})
            </div>
            <div className="flex-1 min-h-0">
              <LazyPlot
                data={flowSankey}
                layout={{
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  margin: { l: 5, r: 5, t: 5, b: 5 },
                  font: { color: '#94a3b8', size: 9 }
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
