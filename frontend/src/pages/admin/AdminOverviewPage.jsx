import {
  Activity,
  Archive,
  Cpu,
  Database,
  FlaskConical,
  GitBranch,
  HardDrive,
  RadioTower,
  TriangleAlert,
  Users,
} from 'lucide-react'
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
import { useLanguage } from '../../contexts/LanguageContext'
import { apiJson } from '../../utils/api'

const CHART_COLORS = [
  'var(--admin-chart-2)',
  'var(--admin-chart-1)',
  'var(--admin-chart-3)',
  'var(--admin-chart-4)',
  'var(--admin-chart-6)',
  'var(--admin-chart-5)',
]

export default function AdminOverviewPage() {
  const { t } = useLanguage()
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

  const pressureScore = (summary?.active_sessions ?? 0) + (summary?.failed_sessions_recent ?? 0) + (summary?.blob_orphan_count ?? 0)
  const pressureTone = pressureScore === 0 ? 'healthy' : pressureScore < 6 ? 'watch' : 'critical'
  const onlineCount = [summary?.mongo_available, summary?.redis_available].filter(Boolean).length
  const totalEntities = (summary?.users ?? 0) + (summary?.projects ?? 0) + (summary?.datasets ?? 0) + (summary?.experiments ?? 0)

  const heroSignals = useMemo(() => ([
    {
      icon: Database,
      label: t('admin.mongo'),
      value: summary?.mongo_available ? t('admin.online') : t('admin.offline'),
      status: summary?.mongo_available,
    },
    {
      icon: Cpu,
      label: t('admin.redis'),
      value: summary?.redis_available ? t('admin.online') : t('admin.offline'),
      status: summary?.redis_available,
    },
    {
      icon: HardDrive,
      label: t('admin.blob_store'),
      value: summary?.blob_provider || 'local',
    },
    {
      icon: TriangleAlert,
      label: t('admin.pressure'),
      value: pressureScore === 0 ? t('admin.calm') : pressureScore < 6 ? t('admin.watch') : t('admin.hot'),
      tone: pressureTone,
    },
  ]), [pressureScore, pressureTone, summary, t])

  const heroPills = useMemo(() => ([
    {
      icon: Users,
      label: t('admin.workspace_composition'),
      value: totalEntities,
    },
    {
      icon: HardDrive,
      label: t('admin.infrastructure_surface'),
      value: `${onlineCount}/2 ${t('admin.online')}`,
    },
    {
      icon: Archive,
      label: t('admin.blob_store'),
      value: summary?.blob_provider || 'local',
    },
  ]), [onlineCount, summary, t, totalEntities])

  const entityMix = useMemo(() => {
    if (!summary) return []
    return [
      { name: t('admin.users'), value: summary.users ?? 0, fill: CHART_COLORS[0] },
      { name: t('admin.projects'), value: summary.projects ?? 0, fill: CHART_COLORS[1] },
      { name: t('admin.datasets_label'), value: summary.datasets ?? 0, fill: CHART_COLORS[2] },
      { name: t('admin.experiments'), value: summary.experiments ?? 0, fill: CHART_COLORS[3] },
      { name: t('admin.sessions'), value: summary.training_sessions ?? 0, fill: CHART_COLORS[4] },
    ]
  }, [summary, t])

  const riskBars = useMemo(() => {
    if (!summary) return []
    return [
      { name: t('admin.active_label_short'), value: summary.active_sessions ?? 0, fill: 'var(--admin-chart-4)' },
      { name: t('admin.failed_label_short'), value: summary.failed_sessions_recent ?? 0, fill: 'var(--admin-chart-5)' },
      { name: t('admin.compacted_label_short'), value: summary.retention_compacted_runs ?? 0, fill: 'var(--admin-chart-2)' },
      { name: t('admin.audit_label_short'), value: summary.recent_audit_events ?? 0, fill: 'var(--admin-chart-3)' },
      { name: t('admin.orphan_label_short'), value: summary.blob_orphan_count ?? 0, fill: 'var(--admin-chart-6)' },
    ]
  }, [summary, t])

  const topologyArea = useMemo(() => {
    if (!summary) return []
    return [
      { name: t('admin.datasets_short'), count: summary.datasets ?? 0 },
      { name: t('admin.versions_short'), count: summary.dataset_versions ?? 0 },
      { name: t('admin.experiments_short'), count: summary.experiments ?? 0 },
      { name: t('admin.sessions_short'), count: summary.training_sessions ?? 0 },
      { name: t('admin.blobs_short'), count: summary.blob_object_count ?? 0 },
    ]
  }, [summary, t])

  const serviceDonut = useMemo(() => {
    if (!summary) return []
    return [
      { name: t('admin.online'), value: onlineCount, fill: 'var(--admin-chart-4)' },
      { name: t('admin.needs_attention'), value: Math.max(0, 2 - onlineCount), fill: 'var(--admin-chart-5)' },
    ]
  }, [onlineCount, summary, t])

  const kpiCards = useMemo(() => ([
    { icon: Users, label: t('admin.users'), value: summary?.users ?? 0, meta: t('admin.workspace_composition'), tone: 'primary' },
    { icon: GitBranch, label: t('admin.projects'), value: summary?.projects ?? 0, meta: t('admin.operational_summary'), tone: 'secondary' },
    { icon: FlaskConical, label: t('admin.experiments'), value: summary?.experiments ?? 0, meta: t('admin.execution_risk'), tone: 'tertiary' },
    { icon: Activity, label: t('admin.sessions'), value: summary?.training_sessions ?? 0, meta: t('admin.infrastructure_surface'), tone: 'accent' },
    { icon: Cpu, label: t('admin.active_sessions'), value: summary?.active_sessions ?? 0, meta: t('admin.active_label'), tone: 'success' },
    { icon: TriangleAlert, label: t('admin.failed_7d'), value: summary?.failed_sessions_recent ?? 0, meta: t('admin.operational_pressure'), tone: pressureTone },
  ]), [pressureTone, summary, t])

  if (loading) {
    return <LoadingState title={t('admin.loading_summary')} className="min-h-[480px]" />
  }

  if (error) {
    return <ErrorState title={t('admin.load_summary_error')} error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      <section className="admin-overview-hero admin-card">
        <div className="admin-overview-hero__copy">
          <div className="admin-overview-hero__eyebrow">
            <RadioTower size={13} />
            {t('admin.control_tower')}
          </div>
          <h2 className="admin-overview-hero__title">{t('admin.platform_pulse')}</h2>
          <p className="admin-overview-hero__body">{t('admin.platform_pulse_desc')}</p>

          <div className="admin-overview-command-strip">
            {heroPills.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="admin-overview-pill">
                  <div className="admin-overview-pill__icon">
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="admin-overview-pill__label">{item.label}</div>
                    <div className="admin-overview-pill__value">{item.value}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="admin-overview-hero__signals">
          {heroSignals.map((item) => (
            <MiniSignal
              key={item.label}
              label={item.label}
              value={item.value}
              status={item.status}
              tone={item.tone}
            />
          ))}
        </div>
      </section>

      <section className="admin-overview-kpis">
        {kpiCards.map((item) => (
          <KpiCard
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={item.value}
            meta={item.meta}
            tone={item.tone}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartCard
          title={t('admin.workspace_composition')}
          subtitle={t('admin.workspace_composition_sub')}
          footer={t('admin.workspace_composition_footer')}
          icon={Users}
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
                    stroke="rgba(255,255,255,0.35)"
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
                <LegendTile key={item.name} label={item.name} value={item.value} color={item.fill} />
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title={t('admin.execution_risk')}
          subtitle={t('admin.execution_risk_sub')}
          footer={t('admin.execution_risk_footer')}
          icon={TriangleAlert}
        >
          <ChartShell height={320}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskBars} margin={{ top: 14, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--c-fg-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: 'var(--c-fg-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
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
          title={t('admin.operational_summary')}
          subtitle={t('admin.operational_summary_sub')}
          footer={t('admin.operational_summary_footer')}
          icon={Activity}
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
                <XAxis dataKey="name" tick={{ fill: 'var(--c-fg-muted)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fill: 'var(--c-fg-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
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
          title={t('admin.infrastructure_surface')}
          subtitle={t('admin.infrastructure_surface_sub')}
          footer={t('admin.infrastructure_surface_footer')}
          icon={HardDrive}
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
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={2}
                  >
                    {serviceDonut.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<OverviewTooltip suffix={t('admin.services_suffix')} />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartShell>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile label={t('admin.blob_objects')} value={summary?.blob_object_count ?? 0} tone="warn" />
              <SummaryTile label={t('admin.blob_orphans')} value={summary?.blob_orphan_count ?? 0} tone="danger" />
              <SummaryTile label={t('admin.dataset_versions')} value={summary?.dataset_versions ?? 0} tone="info" />
              <SummaryTile label={t('admin.audit_7d')} value={summary?.recent_audit_events ?? 0} tone="accent" />
            </div>
          </div>
        </ChartCard>
      </section>
    </div>
  )
}

function ChartCard({ title, subtitle, footer, icon: Icon, children }) {
  return (
    <section className="admin-overview-section admin-card">
      <div className="admin-overview-section__header">
        <div className="admin-overview-section__titlewrap">
          <div className="admin-overview-icon-shell">
            <Icon size={14} />
          </div>
          <div>
            <div className="admin-overview-section__title">{title}</div>
            {subtitle ? <div className="admin-overview-section__subtitle">{subtitle}</div> : null}
          </div>
        </div>
      </div>
      {children}
      <div className="admin-overview-section__footer">{footer}</div>
    </section>
  )
}

function ChartShell({ height, children }) {
  return (
    <div className="admin-chart-shell p-3" style={{ height }}>
      {children}
    </div>
  )
}

function MiniSignal({ label, value, status, tone }) {
  return (
    <div className="admin-signal-tile admin-signal-tile-hero">
      <div className="admin-signal-label">
        {label}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {status !== undefined ? (
          <span className={`admin-status-pulse ${status ? 'admin-status-pulse-on' : 'admin-status-pulse-off'}`} />
        ) : null}
        <span className={`admin-signal-value ${tone ? `admin-signal-value-${tone}` : ''}`}>{value}</span>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, meta, tone = 'primary' }) {
  return (
    <div className={`admin-kpi-card admin-kpi-card-${tone}`}>
      <div className="admin-kpi-card__top">
        <div className="admin-overview-icon-shell">
          <Icon size={15} />
        </div>
        <div className="admin-kpi-card__meta">{meta}</div>
      </div>
      <div className="admin-kpi-card__label">{label}</div>
      <div className="admin-kpi-card__value">{value}</div>
    </div>
  )
}

function LegendTile({ label, value, color }) {
  return (
    <div className="admin-signal-tile">
      <div className="admin-signal-label">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="admin-signal-value-lg">{value}</div>
    </div>
  )
}

function SummaryTile({ label, value, tone = 'info' }) {
  return (
    <div className={`admin-signal-tile admin-signal-tile-${tone}`}>
      <div className="admin-signal-label">
        {label}
      </div>
      <div className="admin-signal-value-lg">{value}</div>
    </div>
  )
}

function OverviewTooltip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const name = item?.payload?.name || label
  const value = item?.value ?? 0

  return (
    <div className="admin-overview-tooltip">
      <div className="admin-overview-tooltip__title">{name}</div>
      <div className="admin-overview-tooltip__body">
        Value: <span>{value}{suffix}</span>
      </div>
    </div>
  )
}
