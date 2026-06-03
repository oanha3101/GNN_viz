import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Cpu,
  Database,
  FlaskConical,
  FolderKanban,
  Gauge,
  Network,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import useGNNStore from '../../store/useGNNStore'
import { useLanguage } from '../../contexts/LanguageContext'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'

const TASK_META = {
  1: { nameKey: 'tasks_meta.node_classification', color: '#ef4444' },
  2: { nameKey: 'tasks_meta.graph_classification', color: '#f97316' },
  3: { nameKey: 'tasks_meta.link_prediction', color: '#eab308' },
  4: { nameKey: 'tasks_meta.community_detection', color: '#22c55e' },
  5: { nameKey: 'tasks_meta.graph_embedding', color: '#06b6d4' },
  6: { nameKey: 'tasks_meta.graph_generation', color: '#8b5cf6' },
}

const STATUS_COLOR = {
  completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  running: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500 animate-pulse' },
  failed: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  stopped: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
}

function formatRelativeTime(value, t, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return t('dashboard.just_now')
  if (diff < 3600) return t('dashboard.minutes_ago', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('dashboard.hours_ago', { n: Math.floor(diff / 3600) })
  if (diff < 604800) return t('dashboard.days_ago', { n: Math.floor(diff / 86400) })
  return date.toLocaleDateString(locale)
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function build7DayActivity(experiments) {
  const series = []
  const now = new Date()
  const totals = {}
  experiments.forEach((exp) => {
    if (!exp.created_at) return
    const dt = new Date(exp.created_at)
    if (Number.isNaN(dt.getTime())) return
    const key = dayKey(dt)
    totals[key] = (totals[key] || 0) + 1
  })
  for (let i = 6; i >= 0; i -= 1) {
    const dt = new Date(now)
    dt.setDate(dt.getDate() - i)
    const key = dayKey(dt)
    series.push({
      day: dt.toLocaleDateString(undefined, { weekday: 'short' }),
      date: key,
      runs: totals[key] || 0,
    })
  }
  return series
}

function MiniSparkline({ data, color }) {
  if (!data?.length) {
    return <div className="h-10 w-full" />
  }
  const formatted = data.map((value, idx) => ({ idx, value }))
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpiCard({ label, value, delta, deltaTone = 'up', icon: Icon, accent, spark }) {
  const accentClass = {
    rose: 'kpi-accent-rose',
    cyan: 'kpi-accent-cyan',
    amber: 'kpi-accent-amber',
    emerald: 'kpi-accent-emerald',
  }[accent] || 'kpi-accent-rose'

  const sparkColor = {
    rose: '#ef4444',
    cyan: '#06b6d4',
    amber: '#f59e0b',
    emerald: '#10b981',
  }[accent] || '#ef4444'

  return (
    <div className={`kpi-card ${accentClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-icon">{Icon ? <Icon size={18} /> : null}</div>
        {delta != null ? (
          <span className={`kpi-delta ${deltaTone === 'down' ? 'kpi-delta-down' : 'kpi-delta-up'}`}>
            <ArrowUpRight size={11} className={deltaTone === 'down' ? 'rotate-90' : ''} />
            {delta}
          </span>
        ) : null}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <MiniSparkline data={spark} color={sparkColor} />
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const dateLocale = lang === 'vi' ? 'vi-VN' : 'en-US'
  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const activeProjectName = useGNNStore((s) => s.activeProjectName)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const activeDatasetVersionName = useGNNStore((s) => s.activeDatasetVersionName)
  const uploadedFilePath = useGNNStore((s) => s.uploadedFilePath)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])
  const [experiments, setExperiments] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [projectsPayload, datasetsPayload, experimentsPayload] = await Promise.all([
          apiJson('/projects').catch(() => ({ items: [] })),
          apiJson('/datasets').catch(() => ({ items: [] })),
          apiJson('/experiments?page_size=100').catch(() => ({ items: [] })),
        ])
        if (!active) return
        setProjects(normalizeCollectionPayload(projectsPayload).items)
        setDatasets(normalizeCollectionPayload(datasetsPayload).items)
        setExperiments(normalizeCollectionPayload(experimentsPayload).items)
      } catch (err) {
        if (active) setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const stats = useMemo(() => {
    const total = experiments.length
    const accuracies = experiments
      .map((exp) => Number(exp.metrics_json?.summary?.final_accuracy ?? exp.metrics?.summary?.final_accuracy ?? exp.metrics?.summary?.best_score ?? 0))
      .filter((v) => !Number.isNaN(v) && v > 0)
    const avgAccuracy = accuracies.length
      ? accuracies.reduce((acc, v) => acc + v, 0) / accuracies.length
      : 0
    return {
      projects: projects.length,
      datasets: datasets.length,
      experiments: total,
      avgAccuracy,
    }
  }, [projects, datasets, experiments])

  const activitySeries = useMemo(() => build7DayActivity(experiments), [experiments])

  const sparklines = useMemo(() => {
    const projectsBase = projects.slice(-7).map((_, i) => i + 1)
    const datasetsBase = datasets.slice(-7).map((_, i) => i + 1)
    const experimentsBase = activitySeries.map((d) => d.runs)
    const accuracyBase = experiments
      .slice(-7)
      .map((exp) => Number(exp.metrics_json?.summary?.final_accuracy ?? exp.metrics?.summary?.final_accuracy ?? 0.85) || 0.85)
    return {
      projects: projectsBase.length ? projectsBase : [1, 2, 1, 2, 3, 3, projects.length || 0],
      datasets: datasetsBase.length ? datasetsBase : [2, 3, 4, 5, 6, 7, datasets.length || 0],
      experiments: experimentsBase,
      accuracy: accuracyBase.length ? accuracyBase : [0.78, 0.80, 0.83, 0.86, 0.84, 0.88, stats.avgAccuracy || 0.88],
    }
  }, [projects, datasets, experiments, activitySeries, stats.avgAccuracy])

  const taskDistribution = useMemo(() => {
    const counts = {}
    experiments.forEach((exp) => {
      const t = exp.task_type ?? 1
      counts[t] = (counts[t] || 0) + 1
    })
    const out = Object.entries(counts).map(([key, value]) => ({
      task: Number(key),
      name: TASK_META[key]?.nameKey ? t(TASK_META[key].nameKey) : `Task ${key}`,
      value,
      color: TASK_META[key]?.color || '#94a3b8',
    }))
    return out.length ? out : Array.from({ length: 6 }, (_, i) => ({
      task: i + 1,
      name: t(TASK_META[i + 1].nameKey),
      value: 1,
      color: TASK_META[i + 1].color,
    }))
  }, [experiments, t])

  const recentExperiments = useMemo(() => {
    return [...experiments]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [experiments])

  if (loading) {
    return <LoadingState title={t('dashboard.loading_dashboard')} className="min-h-[480px]" />
  }
  if (error) {
    return <ErrorState title={t('dashboard.load_error')} error={error} onRetry={() => window.location.reload()} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      {/* KPI ROW */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t('dashboard.stat_projects')}
          value={stats.projects}
          delta={stats.projects > 0 ? `${stats.projects}` : null}
          icon={FolderKanban}
          accent="rose"
          spark={sparklines.projects}
        />
        <KpiCard
          label={t('dashboard.stat_datasets')}
          value={stats.datasets}
          delta={stats.datasets > 0 ? `${stats.datasets}` : null}
          icon={Database}
          accent="cyan"
          spark={sparklines.datasets}
        />
        <KpiCard
          label={t('dashboard.stat_experiments')}
          value={stats.experiments}
          delta={stats.experiments > 0 ? `${stats.experiments}` : null}
          icon={FlaskConical}
          accent="amber"
          spark={sparklines.experiments}
        />
        <KpiCard
          label={t('dashboard.avg_accuracy')}
          value={`${(stats.avgAccuracy * 100).toFixed(1)}%`}
          delta={stats.avgAccuracy > 0 ? `${(stats.avgAccuracy * 100).toFixed(0)}%` : null}
          icon={Gauge}
          accent="emerald"
          spark={sparklines.accuracy}
        />
      </div>

      {/* ACTIVITY CHART + DONUT */}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <ActivityChart series={activitySeries} totalRuns={stats.experiments} t={t} />
        <TaskDonut distribution={taskDistribution} totalRuns={stats.experiments} t={t} />
      </div>

      {/* RECENT + READINESS + QUICK ACTIONS */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <RecentExperiments items={recentExperiments} onOpen={() => navigate('/app/experiments')} t={t} dateLocale={dateLocale} />
        <div className="space-y-6">
          <ReadinessCard
            activeProjectId={activeProjectId}
            activeProjectName={activeProjectName}
            activeDatasetVersionId={activeDatasetVersionId}
            activeDatasetVersionName={activeDatasetVersionName}
            uploadedFilePath={uploadedFilePath}
            navigate={navigate}
            t={t}
          />
          <QuickActions navigate={navigate} t={t} />
        </div>
      </div>
    </div>
  )
}

function ActivityChart({ series, totalRuns, t }) {
  const max = series.reduce((acc, d) => Math.max(acc, d.runs), 0)
  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="surface-eyebrow">{t('dashboard.training_activity_eyebrow')}</div>
          <h3 className="surface-title">{t('dashboard.training_activity_title')}</h3>
          <p className="surface-sub">{t('dashboard.training_activity_sub')}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-fg">{totalRuns}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-fg-muted">{t('dashboard.total_runs')}</div>
        </div>
      </div>
      <div className="mt-5 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="activity-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--c-primary)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--c-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="runs"
              stroke="var(--c-primary)"
              strokeWidth={2}
              fill="url(#activity-gradient)"
              dot={{ r: 3, fill: 'var(--c-primary)' }}
              activeDot={{ r: 5 }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--c-primary)', strokeOpacity: 0.25 }}
              contentStyle={{
                background: 'var(--c-bg-elev)',
                border: '1px solid var(--c-border)',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--c-fg)',
                boxShadow: '0 8px 24px -10px rgba(15,23,42,0.18)',
              }}
              labelStyle={{ color: 'var(--c-fg-muted)', fontWeight: 600 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 text-[10px] uppercase tracking-[0.14em] text-fg-faint">
        {series.map((d) => (
          <span key={d.date} className={`text-center ${d.runs === max && max > 0 ? 'text-primary' : ''}`}>
            {d.day}
          </span>
        ))}
      </div>
    </section>
  )
}

function TaskDonut({ distribution, totalRuns, t }) {
  return (
    <section className="surface-card p-5">
      <div className="surface-eyebrow">{t('dashboard.task_distribution_eyebrow')}</div>
      <h3 className="surface-title">{t('dashboard.task_distribution_title')}</h3>
      <p className="surface-sub">{t('dashboard.task_distribution_sub')}</p>
      <div className="mt-4 flex items-center gap-5">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distribution}
                dataKey="value"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                stroke="var(--c-bg-elev)"
                strokeWidth={2}
              >
                {distribution.map((entry) => (
                  <Cell key={entry.task} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--c-bg-elev)',
                  border: '1px solid var(--c-border)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--c-fg)',
                }}
                formatter={(value, name) => [`${value} runs`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-black text-fg">{totalRuns}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{t('dashboard.runs')}</div>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5">
          {distribution.map((entry) => (
            <li key={entry.task} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 truncate">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: entry.color }} />
                <span className="truncate text-fg">{entry.name}</span>
              </span>
              <span className="font-mono text-fg-muted">{entry.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function RecentExperiments({ items, onOpen, t, dateLocale }) {
  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="surface-eyebrow">{t('dashboard.recent_eyebrow')}</div>
          <h3 className="surface-title">{t('dashboard.recent_title')}</h3>
          <p className="surface-sub">{t('dashboard.recent_sub')}</p>
        </div>
        <button type="button" onClick={onOpen} className="surface-action">
          {t('dashboard.open_all')} <ArrowRight size={13} />
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty-state mt-5">
          <div className="empty-state-icon"><BookOpen size={20} /></div>
          <div className="empty-state-title">{t('dashboard.no_experiments')}</div>
          <p className="empty-state-desc">{t('dashboard.no_experiments_desc')}</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line-subtle">
          {items.map((exp) => {
            const status = STATUS_COLOR[exp.status] || STATUS_COLOR.completed
            const taskMeta = TASK_META[exp.task_type]
            const taskName = taskMeta ? t(taskMeta.nameKey) : `Task ${exp.task_type}`
            const taskColor = taskMeta?.color || '#94a3b8'
            const accuracy = Number(exp.metrics_json?.summary?.final_accuracy ?? exp.metrics?.summary?.final_accuracy ?? 0)
            const statusLabel = t(`status.${exp.status || 'completed'}`)
            return (
              <li key={exp.id} className="recent-row">
                <div className="recent-row-task" style={{ background: taskColor }}>
                  <Network size={14} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg">{exp.title || t('dashboard.untitled_run')}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
                    <span className="recent-chip">{taskName}</span>
                    <span className="recent-chip">{exp.model_type || 'GCN'}</span>
                    <span className="text-fg-faint">·</span>
                    <span>{formatRelativeTime(exp.created_at, t, dateLocale)}</span>
                  </div>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <div className="font-mono text-sm font-bold text-fg">
                    {accuracy ? `${(accuracy * 100).toFixed(1)}%` : '—'}
                  </div>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, accuracy * 100)}%`,
                        background: taskColor,
                      }}
                    />
                  </div>
                </div>
                <span className={`recent-status ${status.bg} ${status.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {statusLabel}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ReadinessCard({ activeProjectId, activeProjectName, activeDatasetVersionId, activeDatasetVersionName, uploadedFilePath, navigate, t }) {
  const items = [
    {
      done: !!activeProjectId,
      label: activeProjectName || (activeProjectId ? `Project #${activeProjectId}` : t('dashboard.ck_select_project')),
      action: () => navigate('/app/projects'),
      actionLabel: t('nav.projects'),
    },
    {
      done: !!activeDatasetVersionId,
      label: activeDatasetVersionName || (activeDatasetVersionId ? `Version #${activeDatasetVersionId}` : t('dashboard.ck_select_dataset')),
      action: () => navigate('/app/datasets'),
      actionLabel: t('nav.datasets'),
    },
    {
      done: !!uploadedFilePath,
      label: uploadedFilePath ? t('dashboard.ck_upload_done') : t('dashboard.ck_upload_meta'),
      action: () => navigate('/app/lab'),
      actionLabel: t('nav.lab'),
    },
  ]
  const completed = items.filter((it) => it.done).length
  return (
    <section className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="surface-eyebrow">{t('dashboard.readiness_eyebrow')}</div>
          <h3 className="surface-title">{t('dashboard.readiness_title')}</h3>
        </div>
        <div className="text-right">
          <div className="text-xl font-black text-fg">{completed}/{items.length}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{t('dashboard.ready')}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="readiness-row">
            <span className={`readiness-dot ${item.done ? 'readiness-dot-done' : 'readiness-dot-pending'}`} />
            <span className={`flex-1 truncate text-sm ${item.done ? 'text-fg' : 'text-fg-muted'}`}>{item.label}</span>
            <button type="button" onClick={item.action} className="readiness-action">
              {item.actionLabel}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function QuickActions({ navigate, t }) {
  const actions = [
    { icon: FolderKanban, label: t('nav.projects'), desc: t('dashboard.quick_projects_desc'), accent: 'rose', to: '/app/projects' },
    { icon: Database, label: t('nav.datasets'), desc: t('dashboard.quick_datasets_desc'), accent: 'cyan', to: '/app/datasets' },
    { icon: Cpu, label: t('dashboard.open_lab'), desc: t('dashboard.quick_lab_desc'), accent: 'amber', to: '/app/lab' },
    { icon: BookOpen, label: t('nav.experiments'), desc: t('dashboard.quick_experiments_desc'), accent: 'emerald', to: '/app/experiments' },
  ]
  return (
    <section className="surface-card p-5">
      <div className="surface-eyebrow">{t('dashboard.quick_eyebrow')}</div>
      <h3 className="surface-title">{t('dashboard.quick_title')}</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            onClick={() => navigate(a.to)}
            className={`quick-action quick-action-${a.accent}`}
          >
            <a.icon size={16} />
            <div className="flex-1 text-left">
              <div className="text-sm font-bold">{a.label}</div>
              <div className="text-[11px] opacity-80">{a.desc}</div>
            </div>
            <ArrowRight size={14} className="opacity-60" />
          </button>
        ))}
      </div>
    </section>
  )
}
