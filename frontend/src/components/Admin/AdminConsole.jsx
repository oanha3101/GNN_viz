import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Database,
  FileClock,
  FolderKanban,
  MonitorCog,
  RefreshCw,
  Shield,
  Users,
  X,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { apiUrl } from '../../utils/api'
import Panel from '../primitives/Panel'
import LoadingState from '../primitives/LoadingState'
import ErrorState from '../primitives/ErrorState'
import EmptyState from '../primitives/EmptyState'

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: MonitorCog },
  { id: 'users', label: 'Người dùng', icon: Users },
  { id: 'datasets', label: 'Dataset', icon: Database },
  { id: 'experiments', label: 'Runs', icon: FolderKanban },
  { id: 'sessions', label: 'Sessions', icon: Activity },
  { id: 'retention', label: 'Retention', icon: Shield },
  { id: 'audit', label: 'Audit', icon: FileClock },
]

const ROLE_OPTIONS = ['admin', 'researcher', 'viewer']

function StatCard({ label, value, tone = 'cyan' }) {
  const toneMap = {
    cyan: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/5',
    amber: 'text-amber-300 border-amber-500/20 bg-amber-500/5',
    red: 'text-red-300 border-red-500/20 bg-red-500/5',
    emerald: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/5',
  }
  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.cyan}`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  )
}

function DataCard({ title, subtitle, action, children }) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function AdminConsole({ isOpen, onClose, initialTab = 'overview', variant = 'modal' }) {
  const user = useAuthStore((s) => s.user)
  const getAuthHeaders = useAuthStore((s) => s.getAuthHeaders)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    overview: null,
    users: [],
    datasets: [],
    experiments: [],
    sessions: [],
    audit: [],
    retention: [],
  })
  const [roleDrafts, setRoleDrafts] = useState({})
  const [retentionBusy, setRetentionBusy] = useState(false)

  const isAdmin = !user || user.role === 'admin'

  const adminFetch = useCallback(async (path, options = {}) => {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    })
    const contentType = res.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await res.json() : await res.text()
    if (!res.ok) {
      const detail = typeof payload === 'string' ? payload : payload.detail || 'Request failed'
      throw new Error(detail)
    }
    return payload
  }, [getAuthHeaders])

  const loadTab = useCallback(async (tab = activeTab) => {
    if (!isOpen) return
    if (!isAdmin) {
      setError(new Error('Cần đăng nhập tài khoản admin để sử dụng Admin Console.'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (tab === 'overview') {
        const overview = await adminFetch('/admin/summary')
        setData((prev) => ({ ...prev, overview }))
      } else if (tab === 'users') {
        const payload = await adminFetch('/admin/users')
        setData((prev) => ({ ...prev, users: payload.items || [] }))
        setRoleDrafts(
          Object.fromEntries((payload.items || []).map((item) => [item.id, item.role]))
        )
      } else if (tab === 'datasets') {
        const payload = await adminFetch('/admin/datasets')
        setData((prev) => ({ ...prev, datasets: payload.items || [] }))
      } else if (tab === 'experiments') {
        const payload = await adminFetch('/admin/experiments')
        setData((prev) => ({ ...prev, experiments: payload.items || [] }))
      } else if (tab === 'sessions') {
        const payload = await adminFetch('/admin/sessions')
        setData((prev) => ({ ...prev, sessions: payload.items || [] }))
      } else if (tab === 'audit') {
        const payload = await adminFetch('/admin/audit-logs')
        setData((prev) => ({ ...prev, audit: payload.items || [] }))
      } else if (tab === 'retention') {
        const payload = await adminFetch('/admin/retention?dry_run=true', { method: 'POST' })
        setData((prev) => ({ ...prev, retention: payload.results || [] }))
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, adminFetch, isAdmin, isOpen])

  useEffect(() => {
    if (isOpen) loadTab(activeTab)
  }, [activeTab, isOpen, loadTab])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const currentData = useMemo(() => {
    if (activeTab === 'overview') return data.overview
    return data[activeTab]
  }, [activeTab, data])

  const handleRoleSave = useCallback(async (userId) => {
    try {
      await adminFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: roleDrafts[userId] }),
      })
      await loadTab('users')
      await loadTab('audit')
    } catch (err) {
      setError(err)
    }
  }, [adminFetch, loadTab, roleDrafts])

  const handleSessionAction = useCallback(async (sessionId, action) => {
    try {
      await adminFetch(`/admin/sessions/${sessionId}/${action}`, { method: 'POST' })
      await loadTab('sessions')
      await loadTab('audit')
      if (data.overview) await loadTab('overview')
    } catch (err) {
      setError(err)
    }
  }, [adminFetch, data.overview, loadTab])

  const handleRunRetention = useCallback(async (dryRun) => {
    setRetentionBusy(true)
    try {
      const payload = await adminFetch(`/admin/retention?dry_run=${dryRun ? 'true' : 'false'}`, {
        method: 'POST',
      })
      setData((prev) => ({ ...prev, retention: payload.results || [] }))
      if (!dryRun) {
        await loadTab('overview')
        await loadTab('audit')
      }
    } catch (err) {
      setError(err)
    } finally {
      setRetentionBusy(false)
    }
  }, [adminFetch, loadTab])

  if (!isOpen) return null

  const isPage = variant === 'page'
  const shellOuterClass = isPage
    ? 'h-full min-h-[720px]'
    : 'fixed inset-0 z-[95] bg-slate-950/90 backdrop-blur-sm p-6'
  const shellInnerClass = isPage
    ? 'flex h-full w-full overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'
    : 'mx-auto flex h-full w-full max-w-7xl overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'

  return (
    <div className={shellOuterClass}>
      <div className={shellInnerClass}>
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-slate-800/60 bg-slate-950/50">
          <div className="border-b border-slate-800/60 px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-cyan-300/80">
              <Shield size={13} /> Admin Console
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">Vận hành hệ thống</h2>
            <p className="mt-1 text-xs text-slate-500">
              Theo dõi user, dataset, session, retention và audit log trong một nơi.
            </p>
          </div>
          <div className="flex-1 space-y-1 p-3">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/12 text-cyan-300 border border-cyan-500/20'
                      : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Icon size={15} />
                  <span className="font-medium">{tab.label}</span>
                </button>
              )
            })}
          </div>
          {!isPage ? (
            <div className="border-t border-slate-800/60 p-3">
            <button
              onClick={onClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              <X size={14} /> Đóng
            </button>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
            <div>
              <div className="text-sm font-semibold text-white">
                {TABS.find((tab) => tab.id === activeTab)?.label}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {user ? `Đăng nhập: ${user.username} (${user.role})` : 'Dev mode / auth disabled'}
              </div>
            </div>
            <button
              onClick={() => loadTab(activeTab)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-slate-800"
            >
              <RefreshCw size={13} /> Làm mới
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <LoadingState title="Đang tải dữ liệu quản trị..." />
            ) : error ? (
              <ErrorState title="Không tải được dữ liệu admin" error={error} onRetry={() => loadTab(activeTab)} />
            ) : activeTab === 'overview' ? (
              currentData ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Users" value={currentData.users} />
                    <StatCard label="Projects" value={currentData.projects} tone="emerald" />
                    <StatCard label="Experiments" value={currentData.experiments} />
                    <StatCard label="Sessions" value={currentData.training_sessions} tone="amber" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard label="Active Sessions" value={currentData.active_sessions} tone="emerald" />
                    <StatCard label="Failed 7 Days" value={currentData.failed_sessions_recent} tone="red" />
                    <StatCard label="Compacted Runs" value={currentData.retention_compacted_runs} tone="amber" />
                  </div>
                </div>
              ) : (
                <EmptyState icon={<MonitorCog size={30} />} title="Chưa có số liệu" description="Bấm làm mới để tải dashboard vận hành." />
              )
            ) : activeTab === 'users' ? (
              data.users.length ? (
                <div className="space-y-3">
                  {data.users.map((item) => (
                    <DataCard
                      key={item.id}
                      title={`${item.username} (${item.role})`}
                      subtitle={item.email}
                      action={
                        <button
                          onClick={() => handleRoleSave(item.id)}
                          className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300"
                        >
                          Lưu role
                        </button>
                      }
                    >
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>ID: {item.id}</span>
                        <span>Created: {item.created_at || 'n/a'}</span>
                        <span>{item.is_active ? 'Active' : 'Disabled'}</span>
                      </div>
                      <div className="mt-3 max-w-[220px]">
                        <select
                          value={roleDrafts[item.id] || item.role}
                          onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </div>
                    </DataCard>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Users size={30} />} title="Chưa có user" description="Khi hệ thống có người dùng, danh sách sẽ hiện ở đây." />
              )
            ) : activeTab === 'datasets' ? (
              data.datasets.length ? (
                <div className="space-y-3">
                  {data.datasets.map((item) => (
                    <DataCard
                      key={item.id}
                      title={item.name}
                      subtitle={`Slug: ${item.slug}`}
                    >
                      <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-2 xl:grid-cols-4">
                        <span>Versions: {item.version_count}</span>
                        <span>Usage: {item.usage_count}</span>
                        <span>Visibility: {item.is_public ? 'public' : 'private'}</span>
                        <span>Current: {item.current_version ? `v${item.current_version.version} (${item.current_version.lifecycle})` : 'n/a'}</span>
                      </div>
                    </DataCard>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Database size={30} />} title="Chưa có dataset quản trị" description="Dataset mới sẽ được thống kê usage và lifecycle tại đây." />
              )
            ) : activeTab === 'experiments' ? (
              data.experiments.length ? (
                <div className="space-y-3">
                  {data.experiments.map((item) => (
                    <DataCard
                      key={item.id}
                      title={item.title}
                      subtitle={`Task ${item.task_type} • ${item.model_type} • ${item.dataset_name}`}
                    >
                      <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-2 xl:grid-cols-4">
                        <span>Epochs: {item.epoch_count}</span>
                        <span>Best epoch: {item.best_epoch}</span>
                        <span>Status: {item.status}</span>
                        <span>Retention: {item.retention_state}</span>
                      </div>
                    </DataCard>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<FolderKanban size={30} />} title="Chưa có run" description="Khi người dùng lưu experiment, danh sách quản trị sẽ xuất hiện." />
              )
            ) : activeTab === 'sessions' ? (
              data.sessions.length ? (
                <div className="space-y-3">
                  {data.sessions.map((item) => (
                    <DataCard
                      key={item.id}
                      title={item.id}
                      subtitle={`Task ${item.task_type} • ${item.model_type} • ${item.dataset_name}`}
                      action={
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSessionAction(item.id, 'stop')}
                            className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300"
                          >
                            Stop
                          </button>
                          <button
                            onClick={() => handleSessionAction(item.id, 'retry')}
                            className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                          >
                            Retry
                          </button>
                        </div>
                      }
                    >
                      <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-2 xl:grid-cols-4">
                        <span>Status: {item.status}</span>
                        <span>Epoch: {item.last_epoch}/{item.total_epochs}</span>
                        <span>Started: {item.started_at || 'n/a'}</span>
                        <span>{item.error_message ? `Error: ${item.error_message}` : 'No error'}</span>
                      </div>
                    </DataCard>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Activity size={30} />} title="Chưa có session" description="Session monitor sẽ hiện khi có quá trình train được tạo." />
              )
            ) : activeTab === 'retention' ? (
              <div className="space-y-5">
                <Panel
                  title="Retention Monitor"
                  subtitle="Dry-run trước, real-run sau. Chính sách này đã được bật từ Phase 1."
                  actions={
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRunRetention(true)}
                        disabled={retentionBusy}
                        className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 disabled:opacity-50"
                      >
                        {retentionBusy ? 'Running...' : 'Dry Run'}
                      </button>
                      <button
                        onClick={() => handleRunRetention(false)}
                        disabled={retentionBusy}
                        className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  }
                >
                  {data.retention.length ? (
                    <div className="space-y-3">
                      {data.retention.map((item) => (
                        <div key={item.experiment_id} className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-3 text-xs text-slate-400">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-semibold text-white">Experiment #{item.experiment_id}</span>
                            <span>{item.keep_full ? 'Keep full' : 'Compacted'}</span>
                            <span>Mode: {item.mode}</span>
                          </div>
                          <div className="mt-2">Reason: {Array.isArray(item.reason) ? item.reason.join(', ') : item.reason}</div>
                          <div className="mt-1">Kept epochs: {(item.kept_epochs || []).join(', ') || 'none'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={<Shield size={28} />} title="Chưa có retention preview" description="Chạy dry-run để xem run nào sẽ bị compact." />
                  )}
                </Panel>
              </div>
            ) : data.audit.length ? (
              <div className="space-y-3">
                {data.audit.map((item) => (
                  <DataCard
                    key={item.id}
                    title={`${item.action} • ${item.target_type}`}
                    subtitle={`target=${item.target_id || 'n/a'} • actor=${item.actor_user_id || 'system'}`}
                  >
                    <div className="text-xs text-slate-400">{item.created_at || 'n/a'}</div>
                    {item.details_json && (
                      <pre className="mt-3 overflow-auto rounded-xl border border-slate-800/70 bg-slate-950/70 p-3 text-[11px] text-slate-300">
                        {JSON.stringify(item.details_json, null, 2)}
                      </pre>
                    )}
                  </DataCard>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileClock size={30} />} title="Chưa có audit log" description="Các hành động quản trị và governance sẽ được ghi lại ở đây." />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
