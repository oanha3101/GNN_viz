import { Activity, Archive, Database, GitBranch, HardDrive, RadioTower, ShieldCheck, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson } from '../../utils/api'
import { SectionCard, StatCard } from '../shared/PageBlocks'

const CHART_COLORS = [
  'var(--admin-chart-2)',
  'var(--admin-chart-1)',
  'var(--admin-chart-3)',
  'var(--admin-chart-4)',
  'var(--admin-chart-6)',
  'var(--admin-chart-5)',
]

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/summary')
      setSummary(payload)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const payload = await apiJson('/admin/summary')
        if (active) setSummary(payload)
      } catch (err) {
        if (active) setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [])

  const entityMix = useMemo(() => {
    if (!summary) return []
    return [
      { name: 'Users', value: summary.users ?? 0, fill: CHART_COLORS[0] },
      { name: 'Projects', value: summary.projects ?? 0, fill: CHART_COLORS[1] },
      { name: 'Datasets', value: summary.datasets ?? 0, fill: CHART_COLORS[2] },
      { name: 'Experiments', value: summary.experiments ?? 0, fill: CHART_COLORS[3] },
      { name: 'Sessions', value: summary.training_sessions ?? 0, fill: CHART_COLORS[4] },
    ]
  }, [summary])

  const riskBars = useMemo(() => {
    if (!summary) return []
    return [
      { name: 'Active', value: summary.active_sessions ?? 0, fill: 'var(--admin-chart-4)' },
      { name: 'Failed 7d', value: summary.failed_sessions_recent ?? 0, fill: 'var(--admin-chart-5)' },
      { name: 'Compacted', value: summary.retention_compacted_runs ?? 0, fill: 'var(--admin-chart-2)' },
      { name: 'Audit 7d', value: summary.recent_audit_events ?? 0, fill: 'var(--admin-chart-3)' },
      { name: 'Blob Orphans', value: summary.blob_orphan_count ?? 0, fill: 'var(--admin-chart-6)' },
    ]
  }, [summary])

  const topologyArea = useMemo(() => {
    if (!summary) return []
    return [
      { name: 'Datasets', count: summary.datasets ?? 0 },
      { name: 'Versions', count: summary.dataset_versions ?? 0 },
      { name: 'Experiments', count: summary.experiments ?? 0 },
      { name: 'Sessions', count: summary.training_sessions ?? 0 },
      { name: 'Blobs', count: summary.blob_object_count ?? 0 },
    ]
  }, [summary])

  const serviceDonut = useMemo(() => {
    if (!summary) return []
    const onlineCount = [summary.mongo_available, summary.redis_available].filter(Boolean).length
    return [
      { name: 'Online', value: onlineCount, fill: 'var(--admin-chart-4)' },
      { name: 'Needs Attention', value: 2 - onlineCount, fill: 'var(--admin-chart-5)' },
    ]
  }, [summary])

  if (loading) {
    return <LoadingState title="Loading admin summary..." className="min-h-[480px]" />
  }

  if (error) {
    return <ErrorState title="Could not load admin summary" error={error} onRetry={load} className="min-h-[480px]" />
  }

  const pressureScore = (summary?.active_sessions ?? 0) + (summary?.failed_sessions_recent ?? 0) + (summary?.blob_orphan_count ?? 0)
  const pressureTone = pressureScore === 0 ? 'emerald' : pressureScore < 6 ? 'amber' : 'red'

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="glass-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-micro font-semibold uppercase tracking-ultra admin-eyebrow">Control Tower</div>
              <h2 className="mt-2 text-2xl font-black text-white-star">Platform Pulse</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-twilight">
                A visual read on workspace footprint, execution pressure, and whether the admin stack is ready for the next round of training traffic.
              </p>
            </div>
            <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
              <MiniSignal icon={ShieldCheck} label="Mongo" value={summary?.mongo_available ? 'Online' : 'Offline'} status={summary?.mongo_available} />
              <MiniSignal icon={RadioTower} label="Redis" value={summary?.redis_available ? 'Online' : 'Offline'} status={summary?.redis_available} />
              <MiniSignal icon={HardDrive} label="Blob Store" value={summary?.blob_provider || 'local'} />
              <MiniSignal icon={TriangleAlert} label="Pressure" value={pressureScore === 0 ? 'Calm' : pressureScore < 6 ? 'Watch' : 'Hot'} status={pressureScore < 6} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Users" value={summary?.users ?? 0} />
            <StatCard label="Projects" value={summary?.projects ?? 0} tone="emerald" />
            <StatCard label="Experiments" value={summary?.experiments ?? 0} tone="blue" />
            <StatCard label="Sessions" value={summary?.training_sessions ?? 0} tone="amber" />
          </div>
        </div>

        <div className="grid gap-4">
          <StatCard label="Active Sessions" value={summary?.active_sessions ?? 0} tone="emerald" />
          <StatCard label="Failed 7 Days" value={summary?.failed_sessions_recent ?? 0} tone="red" />
          <StatCard label="Compacted Runs" value={summary?.retention_compacted_runs ?? 0} tone="amber" />
          <StatCard label="Operational Pressure" value={pressureScore} tone={pressureTone} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartCard
          title="Workspace Composition"
          subtitle="A doughnut split of the objects currently living inside the admin surface."
          footer="Good for spotting whether the system is mostly people, data, or execution heavy right now."
        >
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <ChartShell height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={entityMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={3}
                    stroke="var(--bg-deep)"
                    strokeWidth={2}
                  >
                    {entityMix.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<OverviewTooltip suffix="" />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartShell>
            <div className="grid gap-3 sm:grid-cols-2">
              {entityMix.map((item) => (
                <LegendTile key={item.name} label={item.name} value={item.value} color={item.fill} icon={item.name === 'Users' ? Users : item.name === 'Datasets' ? Database : item.name === 'Projects' ? GitBranch : Activity} />
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Execution Risk Surface"
          subtitle="Bar view of the operational hotspots that usually need intervention first."
          footer="Failed jobs and orphaned blobs are the fastest signals that the workspace needs cleanup or follow-up."
        >
          <ChartShell height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskBars} margin={{ top: 14, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-twilight)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-twilight)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<OverviewTooltip suffix="" />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {riskBars.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartShell>
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartCard
          title="Operational Summary"
          subtitle="A softer area profile of how data assets and run assets are stacking up."
          footer="This gives the page a trend-like read even when the source data is a single snapshot."
        >
          <ChartShell height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={topologyArea} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="overviewArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--admin-chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--admin-chart-1)" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-twilight)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-twilight)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<OverviewTooltip suffix="" />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--admin-chart-1)"
                  strokeWidth={2.5}
                  fill="url(#overviewArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartShell>
        </ChartCard>

        <ChartCard
          title="Infrastructure Surface"
          subtitle="Readiness of runtime dependencies plus storage inventory that sits underneath the lab."
          footer="Use this block to decide whether the next problem is application-level or infrastructure-level."
        >
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <ChartShell height={250}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={serviceDonut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={86}
                    stroke="var(--bg-deep)"
                    strokeWidth={2}
                  >
                    {serviceDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<OverviewTooltip suffix=" services" />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartShell>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile icon={Archive} label="Blob Objects" value={summary?.blob_object_count ?? 0} tone="text-amber-500 dark:text-amber-300" />
              <SummaryTile icon={TriangleAlert} label="Blob Orphans" value={summary?.blob_orphan_count ?? 0} tone="text-rose-500 dark:text-rose-300" />
              <SummaryTile icon={Database} label="Dataset Versions" value={summary?.dataset_versions ?? 0} tone="text-cyan-600 dark:text-cyan-300" />
              <SummaryTile icon={ShieldCheck} label="Audit 7 Days" value={summary?.recent_audit_events ?? 0} tone="text-indigo-600 dark:text-indigo-300" />
            </div>
          </div>
        </ChartCard>
      </section>
    </div>
  )
}

function ChartCard({ title, subtitle, footer, children }) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      {children}
      <div className="mt-4 border-t border-line-subtle pt-3 text-xs leading-5 text-text-shadow">
        {footer}
      </div>
    </SectionCard>
  )
}

function ChartShell({ height, children }) {
  return (
    <div className="admin-chart-shell p-3" style={{ height }}>
      {children}
    </div>
  )
}

function MiniSignal({ icon: Icon, label, value, status }) {
  return (
    <div className="admin-signal-tile">
      <div className="admin-signal-label">
        <Icon size={13} />
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {status !== undefined ? (
          <span className={`h-2 w-2 rounded-full ${status ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        ) : null}
        <span className="admin-signal-value">{value}</span>
      </div>
    </div>
  )
}

function LegendTile({ icon: Icon, label, value, color }) {
  return (
    <div className="admin-signal-tile">
      <div className="admin-signal-label">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <Icon size={12} />
        {label}
      </div>
      <div className="admin-signal-value-lg">{value}</div>
    </div>
  )
}

function SummaryTile({ icon: Icon, label, value, tone = '' }) {
  return (
    <div className="admin-signal-tile">
      <div className="admin-signal-label">
        <Icon size={12} />
        {label}
      </div>
      <div className={`admin-signal-value-lg ${tone}`}>{value}</div>
    </div>
  )
}

function OverviewTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const name = item?.payload?.name || label
  const value = item?.value ?? 0

  return (
    <div
      className="rounded-lg border border-line-subtle px-3 py-2 text-xs shadow-2xl"
      style={{ background: 'var(--bg-nebula)', color: 'var(--text-starlight)' }}
    >
      <div className="font-semibold text-white-star">{name}</div>
      <div className="mt-1 text-twilight">
        Value: <span className="text-starlight">{value}{suffix}</span>
      </div>
    </div>
  )
}
