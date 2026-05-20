import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Database,
  FolderKanban,
  Layers3,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserCircle2,
  X,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import useGNNStore from '../../store/useGNNStore'
import { apiUrl, getAuthHeaders, normalizeCollectionPayload } from '../../utils/api'
import Panel from '../primitives/Panel'
import LoadingState from '../primitives/LoadingState'
import ErrorState from '../primitives/ErrorState'
import EmptyState from '../primitives/EmptyState'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Layers3 },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'datasets', label: 'Datasets', icon: Database },
  { id: 'auth', label: 'Auth', icon: UserCircle2 },
]

function SmallStat({ label, value, tone = 'cyan' }) {
  const toneMap = {
    cyan: 'border-cyan-500/20 bg-cyan-500/8 text-cyan-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/8 text-amber-300',
  }
  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone] || toneMap.cyan}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-black text-white">{value}</div>
    </div>
  )
}

function ItemCard({ title, subtitle, active, onSelect, action, meta }) {
  return (
    <div className={`rounded-2xl border p-4 transition-all ${active ? 'border-cyan-500/25 bg-cyan-500/6' : 'border-slate-800/70 bg-slate-950/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          {meta && <div className="mt-2 text-xs text-slate-400">{meta}</div>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={onSelect}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${active ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            {active ? 'Đang dùng' : 'Chọn'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WorkspaceConsole({ isOpen, onClose, onOpenDataInput, initialTab = 'dashboard', variant = 'modal' }) {
  const user = useAuthStore((s) => s.user)
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const logout = useAuthStore((s) => s.logout)
  const verifyToken = useAuthStore((s) => s.verifyToken)
  const authLoading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)

  const activeProjectId = useGNNStore((s) => s.activeProjectId)
  const activeProjectName = useGNNStore((s) => s.activeProjectName)
  const activeDatasetId = useGNNStore((s) => s.activeDatasetId)
  const activeDatasetVersionId = useGNNStore((s) => s.activeDatasetVersionId)
  const activeDatasetVersionName = useGNNStore((s) => s.activeDatasetVersionName)
  const uploadedFilePath = useGNNStore((s) => s.uploadedFilePath)
  const uploadMetadata = useGNNStore((s) => s.uploadMetadata)
  const datasetName = useGNNStore((s) => s.datasetName)
  const setActiveProjectContext = useGNNStore((s) => s.setActiveProjectContext)
  const setActiveDatasetContext = useGNNStore((s) => s.setActiveDatasetContext)
  const setUploadedFilePath = useGNNStore((s) => s.setUploadedFilePath)
  const setUploadMetadata = useGNNStore((s) => s.setUploadMetadata)
  const setTaskConfig = useGNNStore((s) => s.setTaskConfig)
  const setDatasetName = useGNNStore((s) => s.setDatasetName)

  const [activeTab, setActiveTab] = useState(initialTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])
  const [selectedDataset, setSelectedDataset] = useState(null)
  const [datasetDetails, setDatasetDetails] = useState({})
  const [projectForm, setProjectForm] = useState({ title: '', description: '' })
  const [datasetForm, setDatasetForm] = useState({ name: '', description: '' })
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({ email: '', username: '', password: '', fullName: '' })

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(options.headers || {}),
      },
    })
    const payload = await res.json()
    if (!res.ok) {
      throw new Error(payload.detail || 'Request failed')
    }
    return payload
  }, [])

  const loadProjects = useCallback(async () => {
    const payload = await fetchJson('/projects')
    setProjects(normalizeCollectionPayload(payload).items)
  }, [fetchJson])

  const loadDatasets = useCallback(async () => {
    const payload = await fetchJson('/datasets')
    const items = normalizeCollectionPayload(payload).items
    setDatasets(items)
    if (!selectedDataset && items.length) {
      setSelectedDataset(items[0].id)
    }
  }, [fetchJson, selectedDataset])

  const loadDatasetDetail = useCallback(async (datasetId) => {
    if (!datasetId) return
    const payload = await fetchJson(`/datasets/${datasetId}`)
    setDatasetDetails((prev) => ({ ...prev, [datasetId]: payload }))
  }, [fetchJson])

  const refreshWorkspace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([loadProjects(), loadDatasets()])
      if (getAuthHeaders().Authorization) {
        await verifyToken()
      }
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [loadDatasets, loadProjects, verifyToken])

  useEffect(() => {
    if (isOpen) refreshWorkspace()
  }, [isOpen, refreshWorkspace])

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (isOpen && activeTab === 'datasets' && selectedDataset && !datasetDetails[selectedDataset]) {
      loadDatasetDetail(selectedDataset).catch(setError)
    }
  }, [activeTab, datasetDetails, isOpen, loadDatasetDetail, selectedDataset])

  const currentDatasetDetail = selectedDataset ? datasetDetails[selectedDataset] : null
  const selectedProject = useMemo(() => projects.find((item) => item.id === activeProjectId) || null, [projects, activeProjectId])
  const selectedDatasetRow = useMemo(() => datasets.find((item) => item.id === activeDatasetId) || null, [datasets, activeDatasetId])
  const applyDatasetVersionContext = useCallback((dataset, version) => {
    setActiveDatasetContext(
      dataset.id,
      version.id,
      `${dataset.name} • v${version.version} (${version.lifecycle})`
    )
    setDatasetName(dataset.name)
    setUploadedFilePath(version.processed_blob_key || null)
    setUploadMetadata(version.summary_json || null)
    setTaskConfig(version.summary_json?.task_profile_config || null)
  }, [setActiveDatasetContext, setDatasetName, setTaskConfig, setUploadMetadata, setUploadedFilePath])

  const handleCreateProject = useCallback(async () => {
    if (!projectForm.title.trim()) return
    try {
      const project = await fetchJson('/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: projectForm.title.trim(),
          description: projectForm.description.trim() || null,
        }),
      })
      setProjectForm({ title: '', description: '' })
      await loadProjects()
      setActiveProjectContext(project.id, project.title)
      setActiveTab('projects')
    } catch (err) {
      setError(err)
    }
  }, [fetchJson, loadProjects, projectForm, setActiveProjectContext])

  const handleCreateDataset = useCallback(async () => {
    const name = datasetForm.name.trim() || datasetName || 'Custom Dataset'
    try {
      const payload = await fetchJson('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: datasetForm.description.trim() || `Imported for ${datasetName || 'workspace'}`,
          summary_json: uploadMetadata || undefined,
          validation_json: uploadMetadata ? { source: 'workspace_console', valid: true } : undefined,
          processed_blob_key: uploadedFilePath || undefined,
        }),
      })
      setDatasetForm({ name: '', description: '' })
      await loadDatasets()
      setSelectedDataset(payload.dataset.id)
      setActiveDatasetContext(
        payload.dataset.id,
        payload.version.id,
        `${payload.dataset.name} • v${payload.version.version} (${payload.version.lifecycle})`
      )
      setActiveTab('datasets')
    } catch (err) {
      setError(err)
    }
  }, [datasetForm, datasetName, fetchJson, loadDatasets, setActiveDatasetContext, uploadMetadata, uploadedFilePath])

  const handleAuthSubmit = useCallback(async () => {
    try {
      if (authMode === 'login') {
        await login(authForm.username, authForm.password)
      } else {
        await register(authForm.email, authForm.username, authForm.password, authForm.fullName)
      }
      setAuthForm({ email: '', username: '', password: '', fullName: '' })
      await refreshWorkspace()
      setActiveTab('dashboard')
    } catch {
      // authStore already stores error
    }
  }, [authForm, authMode, login, refreshWorkspace, register])

  const handlePublishVersion = useCallback(async (datasetId, versionId) => {
    try {
      await fetchJson(`/datasets/${datasetId}/publish?version_id=${versionId}`, { method: 'POST' })
      await loadDatasetDetail(datasetId)
      await loadDatasets()
    } catch (err) {
      setError(err)
    }
  }, [fetchJson, loadDatasetDetail, loadDatasets])

  const handleDeprecateVersion = useCallback(async (datasetId, versionId) => {
    try {
      await fetchJson(`/datasets/${datasetId}/deprecate?version_id=${versionId}`, { method: 'POST' })
      await loadDatasetDetail(datasetId)
      await loadDatasets()
    } catch (err) {
      setError(err)
    }
  }, [fetchJson, loadDatasetDetail, loadDatasets])

  if (!isOpen) return null

  const isPage = variant === 'page'
  const shellOuterClass = isPage
    ? 'h-full min-h-[720px]'
    : 'fixed inset-0 z-[94] bg-slate-950/90 backdrop-blur-sm p-6'
  const shellInnerClass = isPage
    ? 'flex h-full w-full overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'
    : 'mx-auto flex h-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-700/50 bg-[#071120] shadow-2xl'

  return (
    <div className={shellOuterClass}>
      <div className={shellInnerClass}>
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-slate-800/60 bg-slate-950/50">
          <div className="border-b border-slate-800/60 px-5 py-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">
              <Layers3 size={13} /> Workspace
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">User Flow Console</h2>
            <p className="mt-1 text-xs text-slate-500">Auth, projects, datasets và context train trong một nơi.</p>
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
                      ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
                      : 'border border-transparent text-slate-400 hover:bg-slate-900/70 hover:text-slate-200'
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
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300"
            >
              <X size={14} /> Đóng
            </button>
            </div>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-800/60 px-6 py-4">
            <div>
              <div className="text-sm font-semibold text-white">{TABS.find((tab) => tab.id === activeTab)?.label}</div>
              <div className="mt-1 text-xs text-slate-500">
                {user ? `Signed in as ${user.username} (${user.role})` : 'Anonymous / dev mode'}
              </div>
            </div>
            <button
              onClick={refreshWorkspace}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-cyan-300"
            >
              <RefreshCw size={13} /> Làm mới
            </button>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <LoadingState title="Đang tải workspace..." />
            ) : error ? (
              <ErrorState title="Không tải được workspace" error={error} onRetry={refreshWorkspace} />
            ) : activeTab === 'dashboard' ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SmallStat label="Projects" value={projects.length} />
                  <SmallStat label="Datasets" value={datasets.length} tone="emerald" />
                  <SmallStat label="Active Project" value={activeProjectId || '—'} tone="amber" />
                  <SmallStat label="Active Version" value={activeDatasetVersionId || '—'} />
                </div>
                <Panel title="Current Context" subtitle="Đây là context sẽ đi cùng session khi train live.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4 text-sm text-slate-300">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Project</div>
                      <div className="mt-2 font-semibold text-white">{activeProjectName || selectedProject?.title || 'Chưa chọn project'}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4 text-sm text-slate-300">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Dataset Version</div>
                      <div className="mt-2 font-semibold text-white">{activeDatasetVersionName || (activeDatasetVersionId ? `Version #${activeDatasetVersionId}` : 'Chưa chọn version')}</div>
                    </div>
                  </div>
                </Panel>
                <Panel title="Current Upload" subtitle="Metadata từ DataInputView, dùng để sync dataset/version nếu cần.">
                  {uploadedFilePath ? (
                    <div className="space-y-2 text-sm text-slate-300">
                      <div>Dataset name: <span className="text-white font-semibold">{datasetName || 'custom'}</span></div>
                      <div>Processed path: <span className="font-mono text-cyan-300">{uploadedFilePath}</span></div>
                      <div className="text-slate-400">
                        Nodes: {uploadMetadata?.num_nodes ?? '?'} • Edges: {uploadMetadata?.num_edges ?? '?'} • Features: {uploadMetadata?.num_features ?? '?'}
                      </div>
                      {uploadMetadata?.task_profile_name ? (
                        <div className="text-slate-400">
                          Initial profile: <span className="text-white font-medium">{uploadMetadata.task_profile_name}</span>
                        </div>
                      ) : null}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={onOpenDataInput}
                          className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300"
                        >
                          <Upload size={13} /> Mở uploader
                        </button>
                        <button
                          onClick={() => setActiveTab('datasets')}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200"
                        >
                          <Database size={13} /> Sync vào dataset
                        </button>
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon={<Upload size={26} />} title="Chưa có upload context" description="Hãy upload dataset trước nếu muốn gắn processed graph vào dataset/version." />
                  )}
                </Panel>
              </div>
            ) : activeTab === 'projects' ? (
              <div className="space-y-5">
                <Panel title="Create Project" subtitle="Researcher/Admin có thể tạo project mới để nhóm các runs.">
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={projectForm.title}
                      onChange={(e) => setProjectForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Tên project"
                      className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <input
                      value={projectForm.description}
                      onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Mô tả ngắn"
                      className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <button
                      onClick={handleCreateProject}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300"
                    >
                      <Plus size={14} /> Tạo
                    </button>
                  </div>
                </Panel>
                <Panel title="Project List">
                  {projects.length ? (
                    <div className="space-y-3">
                      {projects.map((item) => (
                        <ItemCard
                          key={item.id}
                          title={item.title}
                          subtitle={item.description || 'No description'}
                          meta={`owner=${item.owner_id || 'system'} • ${item.is_public ? 'public' : 'private'}`}
                          active={activeProjectId === item.id}
                          onSelect={() => setActiveProjectContext(item.id, item.title)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={<FolderKanban size={28} />} title="Chưa có project" description="Tạo project đầu tiên để gắn với các training sessions." />
                  )}
                </Panel>
              </div>
            ) : activeTab === 'datasets' ? (
              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Create Dataset" subtitle="Tạo dataset record hoặc sync từ upload hiện tại.">
                  <div className="space-y-3">
                    <input
                      value={datasetForm.name}
                      onChange={(e) => setDatasetForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={datasetName || 'Tên dataset'}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <textarea
                      value={datasetForm.description}
                      onChange={(e) => setDatasetForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Mô tả dataset"
                      rows={4}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateDataset}
                        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300"
                      >
                        <Plus size={14} /> Tạo dataset
                      </button>
                      <button
                        onClick={onOpenDataInput}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200"
                      >
                        <Upload size={14} /> Upload data
                      </button>
                    </div>
                  </div>
                </Panel>

                <Panel title="Dataset Library" subtitle="Chọn dataset ở trái, rồi chọn version để dùng cho train live.">
                  {datasets.length ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {datasets.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setSelectedDataset(item.id)
                              if (!datasetDetails[item.id]) {
                                loadDatasetDetail(item.id).catch(setError)
                              }
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedDataset === item.id ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                      {currentDatasetDetail ? (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
                            <div className="text-sm font-semibold text-white">{currentDatasetDetail.dataset.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{currentDatasetDetail.dataset.description || 'No description'}</div>
                          </div>
                          {currentDatasetDetail.versions.map((version) => {
                            const canSelect = version.lifecycle === 'published' || currentDatasetDetail.dataset.owner_id === user?.id || user?.role === 'admin' || !user
                            const isActive = activeDatasetVersionId === version.id
                            return (
                              <ItemCard
                                key={version.id}
                                title={`v${version.version} • ${version.lifecycle}`}
                                subtitle={`schema ${version.schema_version}`}
                                meta={`created=${version.created_at || 'n/a'}${version.published_at ? ` • published=${version.published_at}` : ''}`}
                                active={isActive}
                                onSelect={() => canSelect && setActiveDatasetContext(currentDatasetDetail.dataset.id, version.id, `${currentDatasetDetail.dataset.name} • v${version.version} (${version.lifecycle})`)}
                                action={
                                  <div className="flex gap-2">
                                    {version.lifecycle !== 'published' && (
                                      <button
                                        onClick={() => handlePublishVersion(currentDatasetDetail.dataset.id, version.id)}
                                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                                      >
                                        Publish
                                      </button>
                                    )}
                                    {version.lifecycle !== 'deprecated' && (
                                      <button
                                        onClick={() => handleDeprecateVersion(currentDatasetDetail.dataset.id, version.id)}
                                        className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300"
                                      >
                                        Deprecate
                                      </button>
                                    )}
                                  </div>
                                }
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <EmptyState icon={<Database size={28} />} title="Chọn một dataset" description="Version list sẽ hiện khi bạn chọn dataset." />
                      )}
                    </div>
                  ) : (
                    <EmptyState icon={<Database size={28} />} title="Chưa có dataset" description="Tạo dataset từ metadata hiện có hoặc upload mới." />
                  )}
                </Panel>
              </div>
            ) : (
              <Panel title="Authentication" subtitle="Đăng nhập để gắn ownership và role cho project/dataset/session.">
                {user ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <ShieldCheck size={16} />
                        <span className="font-semibold">Đã đăng nhập</span>
                      </div>
                      <div className="mt-2 text-sm text-slate-200">{user.username} • {user.email}</div>
                      <div className="mt-1 text-xs text-slate-400">Role: {user.role}</div>
                    </div>
                    <button
                      onClick={logout}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300"
                    >
                      <LogOut size={14} /> Đăng xuất
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAuthMode('login')}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold ${authMode === 'login' ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                      >
                        Login
                      </button>
                      <button
                        onClick={() => setAuthMode('register')}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold ${authMode === 'register' ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                      >
                        Register
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {authMode === 'register' && (
                        <>
                          <input
                            value={authForm.email}
                            onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                            placeholder="Email"
                            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                          />
                          <input
                            value={authForm.fullName}
                            onChange={(e) => setAuthForm((prev) => ({ ...prev, fullName: e.target.value }))}
                            placeholder="Full name"
                            className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                          />
                        </>
                      )}
                      <input
                        value={authForm.username}
                        onChange={(e) => setAuthForm((prev) => ({ ...prev, username: e.target.value }))}
                        placeholder="Username"
                        className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                      />
                      <input
                        type="password"
                        value={authForm.password}
                        onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Password"
                        className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none"
                      />
                    </div>
                    {authError && <div className="text-sm text-red-300">{authError}</div>}
                    <button
                      onClick={handleAuthSubmit}
                      disabled={authLoading}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 disabled:opacity-50"
                    >
                      <LogIn size={14} /> {authLoading ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
                    </button>
                  </div>
                )}
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
