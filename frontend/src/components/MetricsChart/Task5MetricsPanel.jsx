import React, { useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import usePlayerStore from '../../store/playerStore'
import useGNNStore from '../../store/useGNNStore'
import {
  topKOutliers,
  buildNormHistogram,
  computeIsotropy,
  buildKnnScatter,
} from '../../utils/task5Metrics'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'outliers', label: 'Outliers' },
  { id: 'knn', label: 'KNN' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

export default function Task5MetricsPanel() {
  const { snapshots, currentEpochFloat } = usePlayerStore()
  const graphData = useGNNStore((s) => s.graphData)
  const setOutlierPulse = useGNNStore((s) => s.setOutlierPulse)
  const setSelectedNode = useGNNStore((s) => s.setSelectedNode)
  const [activeTab, setActiveTab] = useState('overview')

  const epochInt = Math.max(0, Math.min(snapshots.length - 1, Math.floor(currentEpochFloat)))
  const snap = snapshots[epochInt]

  if (!snapshots.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 p-6 gap-2">
        <div className="text-3xl opacity-40 animate-pulse">∴</div>
        <p className="text-micro text-center">Bắt đầu huấn luyện để xem chỉ số embedding</p>
      </div>
    )
  }

  const handleOutlierClick = (id) => {
    setSelectedNode(id)
    setOutlierPulse(id)
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`text-nano font-bold uppercase tracking-ultra px-2.5 py-1 rounded-md transition-colors ${
              activeTab === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab snap={snap} snapshots={snapshots} epochInt={epochInt} />}
      {activeTab === 'outliers' && <OutliersTab snap={snap} onOutlierClick={handleOutlierClick} graphData={graphData} />}
      {activeTab === 'knn' && <KnnTab snap={snap} graphData={graphData} />}
      {activeTab === 'diagnostics' && <DiagnosticsTab snap={snap} />}
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────
function OverviewTab({ snap, snapshots, epochInt }) {
  const history = useMemo(
    () => snapshots.slice(0, epochInt + 1).map((s, i) => ({
      epoch: i,
      knn: (s.knn_preservation ?? 0) * 100,
      auc: (s.link_recon_auc ?? 0) * 100,
      loss: s.reconstruction_loss ?? s.train_loss ?? 0,
    })),
    [snapshots, epochInt],
  )

  const knnVal = snap?.knn_preservation ?? 0
  const aucVal = snap?.link_recon_auc ?? 0
  const lossVal = snap?.reconstruction_loss ?? snap?.train_loss ?? 0
  const isoVal = snap?.isotropy_score ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid grid-cols-4 gap-2">
        <Metric label="k-NN" value={`${(knnVal * 100).toFixed(0)}%`} tone={knnVal > 0.7 ? 'emerald' : 'amber'} />
        <Metric label="AUC" value={`${(aucVal * 100).toFixed(0)}%`} tone={aucVal > 0.8 ? 'emerald' : 'amber'} />
        <Metric label="Loss" value={lossVal.toFixed(3)} tone="slate" />
        <Metric label="Isotropy" value={`${(isoVal * 100).toFixed(0)}%`} tone={isoVal > 0.6 ? 'emerald' : 'amber'} />
      </div>

      <Panel title="k-NN · AUC · Loss / Epoch">
        <div className="h-44 w-full p-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="epoch" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="pct" domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="loss" orientation="right" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Line yAxisId="pct" type="monotone" dataKey="knn" stroke="#22d3ee" strokeWidth={2} dot={false} name="kNN %" />
              <Line yAxisId="pct" type="monotone" dataKey="auc" stroke="#a855f7" strokeWidth={2} dot={false} name="AUC %" />
              <Line yAxisId="loss" type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} dot={false} name="Loss" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <p className="text-nano text-slate-500 px-1">
        k-NN giữ lân cận trong không gian embedding. AUC đo khả năng tái tạo
        liên kết. Loss giảm = embedding đang được refine.
      </p>
    </div>
  )
}

// ── Outliers ────────────────────────────────────────────────────────
function OutliersTab({ snap, onOutlierClick, graphData }) {
  const scores = snap?.outlier_scores
  const rows = useMemo(() => topKOutliers(scores, 10), [scores])

  if (!Array.isArray(scores) || !scores.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-micro text-slate-500 px-4 text-center">
        Snapshot hiện tại chưa có `outlier_scores` — sẽ xuất hiện sau epoch 1.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <Panel title={`Top ${rows.length} outlier nodes`}>
        <div className="divide-y divide-slate-800/80">
          {rows.map((r) => {
            const node = graphData?.nodes?.find((n) => n.id === r.id)
            const degree = node?.degree ?? '—'
            return (
              <button
                key={r.id}
                onClick={() => onOutlierClick(r.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-slate-800/50 transition-colors text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-nano text-slate-500">#{r.id}</span>
                  <span className="font-mono text-micro text-slate-300">deg {degree}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-micro font-bold text-red-400">{r.score.toFixed(3)}</span>
                  <span className="text-nano text-slate-500 group-hover:text-cyan-400 transition-colors">pulse →</span>
                </div>
              </button>
            )
          })}
        </div>
      </Panel>
      <p className="text-nano text-slate-500 px-1">
        Click một hàng để pulse node trên canvas (~1.5s). Outlier score cao
        = node nằm xa trung tâm cluster hoặc có k-NN preservation thấp.
      </p>
    </div>
  )
}

// ── KNN Preservation ────────────────────────────────────────────────
function KnnTab({ snap, graphData }) {
  const perNode = snap?.per_node_knn_preservation
  const degrees = useMemo(() => {
    if (!graphData?.nodes?.length) return []
    const out = new Array(graphData.nodes.length).fill(0)
    for (const n of graphData.nodes) out[n.id] = n.degree ?? 0
    return out
  }, [graphData])

  const points = useMemo(() => buildKnnScatter(degrees, perNode ?? []), [degrees, perNode])

  if (!Array.isArray(perNode) || !perNode.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-micro text-slate-500 px-4 text-center">
        Snapshot hiện tại chưa có `per_node_knn_preservation`.
      </div>
    )
  }

  const meanKnn = points.reduce((s, p) => s + p.knn, 0) / Math.max(1, points.length)

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <Panel title={`Degree × k-NN preservation (${points.length} nodes)`}>
        <div className="h-56 w-full p-1">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 18, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="degree"
                type="number"
                tick={{ fontSize: 9, fill: '#64748b' }}
                label={{ value: 'degree →', position: 'insideBottom', offset: -4, fill: '#475569', fontSize: 9 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                dataKey="knn"
                type="number"
                domain={[0, 1]}
                tick={{ fontSize: 9, fill: '#64748b' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }}
                formatter={(v, k) => k === 'knn' ? v.toFixed(3) : v}
              />
              <ReferenceLine y={meanKnn} stroke="#06b6d4" strokeDasharray="4 3" />
              <Scatter data={points} fill="#6366f1" fillOpacity={0.55} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <p className="text-nano text-slate-500 px-1">
        Đường cyan là trung bình toàn đồ thị ({meanKnn.toFixed(3)}). Node bên dưới
        đường này = lân cận gốc không được bảo toàn tốt → ứng viên outlier.
      </p>
    </div>
  )
}

// ── Diagnostics ─────────────────────────────────────────────────────
function DiagnosticsTab({ snap }) {
  const norms = snap?.embedding_norms ?? []
  const emb2d = snap?.embeddings_2d ?? []

  const histogram = useMemo(() => buildNormHistogram(norms, 14), [norms])
  const isoClient = useMemo(() => computeIsotropy(emb2d), [emb2d])
  const isoServer = typeof snap?.isotropy_score === 'number' ? snap.isotropy_score : null

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
      <div className="grid gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Panel title="Embedding norm histogram">
          {histogram.length ? (
            <div className="h-40 w-full p-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ top: 6, right: 10, bottom: 14, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }} />
                  <Bar dataKey="count" fill="#22d3ee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-5 text-center text-nano text-slate-500">No embedding norms available</div>
          )}
        </Panel>

        <Panel title="Isotropy">
          <div className="p-3 space-y-3">
            <IsotropyGauge value={isoServer ?? isoClient} />
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="BE score" value={isoServer == null ? '—' : isoServer.toFixed(3)} />
              <MiniStat label="Client PCA" value={isoClient.toFixed(3)} />
            </div>
            <p className="text-nano text-slate-500 leading-relaxed">
              Isotropy gần 1 = các hướng đều quan trọng như nhau (đẹp).
              Gần 0 = embedding bị nén về một trục duy nhất (collapse).
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ── Primitives ──────────────────────────────────────────────────────
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
