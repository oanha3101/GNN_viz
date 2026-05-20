import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  buildKnnScatter,
  buildNormHistogram,
  computeIsotropy,
  topKOutliers,
} from '../../utils/task5Metrics'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'outliers', label: 'Outliers' },
  { id: 'neighborhood', label: 'Neighborhood' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function Task5MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore((s) => s.graphData)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setOutlierPulse = useGNNStore((s) => s.setOutlierPulse)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const [activeTab, setActiveTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">...</div>
        <p className="text-micro text-center">Start training to see embedding diagnostics.</p>
      </div>
    )
  }

  const handleOutlierClick = (id) => {
    setSelectedNode(id)
    setOutlierPulse(id)
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1 px-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-nano font-bold uppercase tracking-ultra px-2.5 py-1 rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-800 text-white'
                : 'bg-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} />}
      {activeTab === 'outliers' && (
        <OutliersTab snap={snap} onOutlierClick={handleOutlierClick} graphData={graphData} />
      )}
      {activeTab === 'neighborhood' && (
        <NeighborhoodTab snap={snap} graphData={graphData} onNodeClick={handleOutlierClick} />
      )}
      {activeTab === 'diagnostics' && (
        <DiagnosticsTab
          snap={snap}
          snapshots={snapshots}
          epochInt={epochInt}
          selectedModel={selectedModel}
        />
      )}
    </div>
  )
}

function OverviewTab({ snap, snapshots, epochInt }) {
  const history = useMemo(
    () =>
      snapshots.slice(0, epochInt + 1).map((entry, index) => ({
        epoch: index,
        knn: (entry.knn_preservation ?? 0) * 100,
        auc: (entry.link_recon_auc ?? 0) * 100,
        loss: entry.reconstruction_loss ?? entry.train_loss ?? 0,
      })),
    [epochInt, snapshots],
  )

  const knnValue = snap?.knn_preservation ?? 0
  const aucValue = snap?.link_recon_auc ?? 0
  const lossValue = snap?.reconstruction_loss ?? snap?.train_loss ?? 0
  const isotropyValue = snap?.isotropy_score ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Metric label="k-NN" value={`${(knnValue * 100).toFixed(0)}%`} tone={knnValue > 0.7 ? 'emerald' : 'amber'} />
        <Metric label="AUC" value={`${(aucValue * 100).toFixed(0)}%`} tone={aucValue > 0.8 ? 'emerald' : 'amber'} />
        <Metric label="Loss" value={lossValue.toFixed(3)} tone="slate" />
        <Metric label="Isotropy" value={`${(isotropyValue * 100).toFixed(0)}%`} tone={isotropyValue > 0.6 ? 'emerald' : 'amber'} />
      </div>

      <Panel title="k-NN, AUC, and Loss over Epochs">
        <div className="h-44 w-full p-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="loss" orientation="right" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <Line yAxisId="pct" type="monotone" dataKey="knn" stroke="#22d3ee" strokeWidth={2} dot={false} name="kNN %" />
              <Line yAxisId="pct" type="monotone" dataKey="auc" stroke="#a855f7" strokeWidth={2} dot={false} name="AUC %" />
              <Line yAxisId="loss" type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} dot={false} name="Loss" />
              <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" yAxisId="pct" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Reading the Embedding">
        <div className="p-3 text-nano text-slate-400 leading-relaxed">
          k-NN preservation tells us whether local neighborhoods stay intact after projection.
          Reconstruction AUC tells us how well the embedding still explains graph connectivity.
          Isotropy catches collapse when all points get squeezed into a narrow direction.
        </div>
      </Panel>
    </div>
  )
}

function OutliersTab({ snap, onOutlierClick, graphData }) {
  const scores = snap?.outlier_scores
  const rows = useMemo(() => topKOutliers(scores, 10), [scores])

  if (!rows.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-micro text-slate-500 px-4 text-center">
        Outlier scores will appear after the first embedding snapshots are available.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <Panel title={`Top ${rows.length} Outlier Nodes`}>
        <div className="divide-y divide-slate-800/80">
          {rows.map((row) => {
            const node = graphData?.nodes?.find((entry) => entry.id === row.id)
            const degree = node?.degree ?? '-'
            return (
              <button
                key={row.id}
                onClick={() => onOutlierClick(row.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-800/50 transition-colors text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-nano text-slate-500">#{row.id}</span>
                  <span className="font-mono text-micro text-slate-300">deg {degree}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-micro font-bold text-red-400">{row.score.toFixed(3)}</span>
                  <span className="text-nano text-slate-500 group-hover:text-cyan-400 transition-colors">pulse</span>
                </div>
              </button>
            )
          })}
        </div>
      </Panel>

      <p className="text-nano text-slate-500 px-1">
        Click a row to pulse that node in the topology view. High outlier score usually means the
        point sits far from its expected local neighborhood.
      </p>
    </div>
  )
}

function NeighborhoodTab({ snap, graphData, onNodeClick }) {
  const perNode = snap?.per_node_knn_preservation
  const degrees = useMemo(() => {
    if (!graphData?.nodes?.length) return []
    const output = new Array(graphData.nodes.length).fill(0)
    for (const node of graphData.nodes) output[node.id] = node.degree ?? 0
    return output
  }, [graphData])

  const points = useMemo(() => buildKnnScatter(degrees, perNode ?? []), [degrees, perNode])
  const meanKnn = points.length
    ? points.reduce((sum, point) => sum + point.knn, 0) / points.length
    : 0

  const norms = snap?.embedding_norms ?? []
  const knnPres = snap?.per_node_knn_preservation ?? []
  const outliers = snap?.outlier_scores ?? []

  const outlierMap = useMemo(() => {
    const map = new Map()
    for (const entry of outliers) map.set(entry.node_id, entry)
    return map
  }, [outliers])

  const [sortBy, setSortBy] = useState('importance')
  const [sortDir, setSortDir] = useState(-1)

  const rows = useMemo(() => {
    if (!graphData?.nodes?.length) return []
    return graphData.nodes.map((node) => {
      const norm = norms[node.id] ?? 0
      const knn = knnPres[node.id] ?? 0
      const outlier = outlierMap.get(node.id)
      const outlierScore = outlier?.avg_distance_to_neighbors ?? 0
      const isOutlier = outlier?.is_outlier ?? false
      const importance = norm * 0.4 + (1 - knn) * 0.3 + outlierScore * 0.3
      return {
        id: node.id,
        degree: node.degree ?? 0,
        norm,
        knn,
        outlierScore,
        isOutlier,
        importance,
      }
    })
  }, [graphData, knnPres, norms, outlierMap])

  const sortedRows = useMemo(() => {
    const key =
      sortBy === 'norm'
        ? 'norm'
        : sortBy === 'knn'
          ? 'knn'
          : sortBy === 'outlier'
            ? 'outlierScore'
            : sortBy === 'degree'
              ? 'degree'
              : sortBy === 'id'
                ? 'id'
                : 'importance'
    return [...rows].sort((a, b) => (a[key] - b[key]) * sortDir)
  }, [rows, sortBy, sortDir])

  const handleSort = (column) => {
    if (sortBy === column) setSortDir((direction) => -direction)
    else {
      setSortBy(column)
      setSortDir(-1)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Panel title={`Degree vs k-NN Preservation (${points.length} nodes)`}>
          {points.length ? (
            <div className="h-56 w-full p-1">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, bottom: 18, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="degree"
                    type="number"
                    tick={{ fontSize: 9, fill: '#64748b' }}
                    label={{ value: 'degree', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis dataKey="knn" type="number" domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(value, key) => (key === 'knn' ? value.toFixed(3) : value)}
                  />
                  <ReferenceLine y={meanKnn} stroke="#06b6d4" strokeDasharray="4 3" />
                  <Scatter data={points} fill="#6366f1" fillOpacity={0.55} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-nano text-slate-500">No per-node k-NN preservation data yet.</div>
          )}
        </Panel>

        <Panel title={`Node Influence Ranking (${sortedRows.length} nodes)`}>
          <div className="divide-y divide-slate-800/80 max-h-64 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 px-2 py-1 bg-slate-900/60 sticky top-0">
              <SortHeader label="ID" active={sortBy === 'id'} direction={sortDir} onClick={() => handleSort('id')} className="w-10" />
              <SortHeader label="Deg" active={sortBy === 'degree'} direction={sortDir} onClick={() => handleSort('degree')} className="w-12" />
              <SortHeader label="Norm" active={sortBy === 'norm'} direction={sortDir} onClick={() => handleSort('norm')} className="flex-1" />
              <SortHeader label="kNN" active={sortBy === 'knn'} direction={sortDir} onClick={() => handleSort('knn')} className="flex-1" />
              <SortHeader label="Outlier" active={sortBy === 'outlier'} direction={sortDir} onClick={() => handleSort('outlier')} className="flex-1" />
              <SortHeader label="Score" active={sortBy === 'importance'} direction={sortDir} onClick={() => handleSort('importance')} className="flex-1" />
            </div>

            {sortedRows.slice(0, 50).map((row) => (
              <button
                key={row.id}
                onClick={() => onNodeClick(row.id)}
                className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-800/50 transition-colors text-left"
              >
                <div className="w-10 font-mono text-micro text-slate-400">#{row.id}</div>
                <div className="w-12 font-mono text-micro text-slate-300">{row.degree}</div>
                <div className="flex-1 font-mono text-micro text-cyan-300">{row.norm.toFixed(2)}</div>
                <div className="flex-1 font-mono text-micro text-indigo-300">{row.knn.toFixed(3)}</div>
                <div className="flex-1 font-mono text-micro text-red-300">{row.outlierScore.toFixed(3)}</div>
                <div className="flex-1">
                  <span className={`font-mono text-micro font-bold ${row.importance > 0.5 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {row.importance.toFixed(3)}
                  </span>
                  {row.isOutlier && <span className="ml-1 text-nano text-red-400">OUT</span>}
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <p className="text-nano text-slate-500 px-1">
        The influence score mixes norm, neighborhood preservation, and outlier pressure. Nodes near
        the top are usually the first places to inspect when an embedding looks unstable.
      </p>
    </div>
  )
}

function DiagnosticsTab({ snap, snapshots, epochInt, selectedModel }) {
  const norms = snap?.embedding_norms ?? []
  const emb2d = snap?.embeddings_2d ?? []
  const histogram = useMemo(() => buildNormHistogram(norms, 14), [norms])
  const isotropyClient = useMemo(() => computeIsotropy(emb2d), [emb2d])
  const isotropyServer = typeof snap?.isotropy_score === 'number' ? snap.isotropy_score : null

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Panel title="Embedding Norm Histogram">
          {histogram.length ? (
            <div className="h-40 w-full p-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Bar dataKey="count" fill="#22d3ee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-5 text-center text-nano text-slate-500">No embedding norms are available yet.</div>
          )}
        </Panel>

        <Panel title="Isotropy">
          <div className="p-3 space-y-3">
            <IsotropyGauge value={isotropyServer ?? isotropyClient} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Backend" value={isotropyServer == null ? '-' : isotropyServer.toFixed(3)} />
              <MiniStat label="Client PCA" value={isotropyClient.toFixed(3)} />
            </div>
            <p className="text-nano text-slate-500 leading-relaxed">
              Isotropy close to 1 means the embedding uses many directions evenly. Values close to 0
              suggest collapse along a narrow axis.
            </p>
          </div>
        </Panel>
      </div>

      <StressSection snap={snap} snapshots={snapshots} epochInt={epochInt} />
      <SignatureSection snapshots={snapshots} epochInt={epochInt} selectedModel={selectedModel} />
    </div>
  )
}

function StressSection({ snap, snapshots, epochInt }) {
  const history = useMemo(
    () =>
      snapshots.slice(0, epochInt + 1).map((entry, index) => ({
        epoch: index,
        stress: (entry.stress_score ?? 0) * 100,
        loss: entry.reconstruction_loss ?? entry.train_loss ?? 0,
      })),
    [epochInt, snapshots],
  )

  const stressValue = snap?.stress_score ?? 0

  return (
    <Panel title="Stress and Distortion">
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Stress" value={`${(stressValue * 100).toFixed(1)}%`} tone={stressValue < 0.3 ? 'emerald' : stressValue < 0.6 ? 'amber' : 'red'} />
          <Metric label="Loss" value={(snap?.reconstruction_loss ?? snap?.train_loss ?? 0).toFixed(4)} tone="slate" />
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
              <ReferenceLine y={30} stroke="#22d3ee" strokeDasharray="4 3" label={{ value: 'good', position: 'right', fill: '#22d3ee', fontSize: 9 }} />
              <Line type="monotone" dataKey="stress" stroke="#f59e0b" strokeWidth={2} dot={false} name="Stress %" />
              <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  )
}

function SignatureSection({ snapshots, epochInt, selectedModel }) {
  const model = selectedModel || 'GCN'
  const snap = snapshots[epochInt]

  const history = useMemo(
    () =>
      snapshots.slice(0, epochInt + 1).map((entry, index) => ({
        epoch: index,
        dirichlet_energy: entry.dirichlet_energy ?? null,
        local_smoothness_avg: Array.isArray(entry.local_smoothness)
          ? averagePositive(entry.local_smoothness)
          : null,
        sage_robustness: entry.sage_robustness ?? null,
      })),
    [epochInt, snapshots],
  )

  const attnHistogram = useMemo(() => {
    if (model !== 'GAT' || !snap?.attention_edges) return null
    const bins = Array.from({ length: 10 }, (_, index) => ({ label: (index / 10).toFixed(1), count: 0 }))
    for (const edge of snap.attention_edges) {
      const bin = Math.min(9, Math.floor(edge.weight * 10))
      bins[bin].count += 1
    }
    return bins
  }, [model, snap?.attention_edges])

  const attnStats = useMemo(() => {
    if (model !== 'GAT' || !snap?.attention_edges?.length) return null
    const weights = snap.attention_edges.map((edge) => edge.weight)
    return {
      average: weights.reduce((sum, value) => sum + value, 0) / weights.length,
      max: Math.max(...weights),
      min: Math.min(...weights),
      count: weights.length,
    }
  }, [model, snap?.attention_edges])

  return (
    <Panel title={`Model Signature · ${model}`}>
      <div className="p-3 space-y-3">
        {model === 'GAT' && (
          <>
            {attnStats ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Metric label="Edges" value={attnStats.count} tone="amber" />
                <Metric label="Avg W" value={attnStats.average.toFixed(3)} tone="amber" />
                <Metric label="Max W" value={attnStats.max.toFixed(3)} tone="emerald" />
                <Metric label="Min W" value={attnStats.min.toFixed(3)} tone="slate" />
              </div>
            ) : (
              <div className="text-nano text-slate-500">No attention-weight summary is available for this epoch.</div>
            )}
            {attnHistogram && (
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attnHistogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Bar dataKey="count" fill="#fbbf24" fillOpacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {model === 'GCN' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Panel title="Dirichlet Energy">
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Line type="monotone" dataKey="dirichlet_energy" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
                    <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Avg Local Smoothness">
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                    <Line type="monotone" dataKey="local_smoothness_avg" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                    <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        )}

        {model === 'SAGE' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="Robustness"
                value={snap?.sage_robustness?.toFixed(3) ?? '-'}
                tone={
                  snap?.sage_robustness == null
                    ? 'slate'
                    : snap.sage_robustness > 0.8
                      ? 'emerald'
                      : snap.sage_robustness > 0.5
                        ? 'amber'
                        : 'red'
                }
              />
              <Metric
                label="Quality"
                value={
                  snap?.sage_robustness == null
                    ? '-'
                    : snap.sage_robustness > 0.8
                      ? 'High'
                      : snap.sage_robustness > 0.5
                        ? 'Medium'
                        : 'Low'
                }
                tone={
                  snap?.sage_robustness == null
                    ? 'slate'
                    : snap.sage_robustness > 0.8
                      ? 'emerald'
                      : snap.sage_robustness > 0.5
                        ? 'amber'
                        : 'red'
                }
              />
            </div>

            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                  <Line type="monotone" dataKey="sage_robustness" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                  <ReferenceLine x={epochInt} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

function SortHeader({ label, active, direction, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`${className} text-left text-nano font-bold uppercase tracking-ultra ${
        active ? 'text-cyan-400' : 'text-slate-500'
      } hover:text-slate-300 transition-colors`}
    >
      {label} {active ? (direction > 0 ? '↑' : '↓') : ''}
    </button>
  )
}

function Metric({ label, value, tone = 'slate' }) {
  const colors = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    cyan: 'text-cyan-300',
    slate: 'text-slate-200',
  }
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2">
      <div className="text-nano uppercase tracking-ultra text-slate-500 font-bold">{label}</div>
      <div className={`font-mono text-lg font-black leading-tight ${colors[tone]}`}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-md px-2 py-1">
      <div className="text-nano uppercase tracking-ultra text-slate-500 font-bold">{label}</div>
      <div className="font-mono text-sm text-slate-200">{value}</div>
    </div>
  )
}

function IsotropyGauge({ value }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100
  const tone = pct > 60 ? 'bg-emerald-500' : pct > 35 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-nano uppercase tracking-ultra text-slate-500 font-bold">Gauge</span>
        <span className="font-mono text-xs text-slate-200">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded bg-slate-800 overflow-hidden">
        <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
      <div className="px-2 py-1.5 border-b border-slate-800 bg-slate-900/60">
        <div className="text-nano uppercase tracking-ultra text-slate-400 font-bold">{title}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function averagePositive(values) {
  const filtered = values.filter((value) => value > 0)
  return filtered.reduce((sum, value) => sum + value, 0) / Math.max(1, filtered.length)
}

const tooltipStyle = { background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }
const tooltipItemStyle = { color: '#e2e8f0' }
const tooltipLabelStyle = { color: '#94a3b8' }
