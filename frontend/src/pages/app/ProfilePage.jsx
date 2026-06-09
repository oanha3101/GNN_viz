import {
  AtSign,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Camera,
  Check,
  ExternalLink,
  GitBranch,
  Globe2,
  IdCard,
  Languages,
  Link as LinkIcon,
  MapPin,
  Palette,
  Save,
  Sparkles,
  Upload,
  User,
  UserRound,
  X,
  BookOpen,
  Database,
  Mail,
  FolderKanban,
  Activity,
  Award,
  ChevronRight,
  ChevronLeft,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import LoadingState from '../../components/primitives/LoadingState'
import LanguageSwitcher from '../../components/ui/LanguageSwitcher'
import ThemeToggle from '../../components/ui/ThemeToggle'
import { useLanguage } from '../../contexts/LanguageContext'
import { useToast } from '../../components/ui/ToastProvider'
import useAuthStore from '../../store/authStore'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'

const EMPTY_FORM = {
  email: '',
  username: '',
  full_name: '',
  bio: '',
  github_url: '',
  organization: '',
  job_title: '',
  location: '',
  profile_image: '',
}

const TASK_META = {
  1: { nameKey: 'tasks_meta.node_classification', color: 'var(--c-primary, #ef4444)' },
  2: { nameKey: 'tasks_meta.graph_classification', color: '#f97316' },
  3: { nameKey: 'tasks_meta.link_prediction', color: '#eab308' },
  4: { nameKey: 'tasks_meta.community_detection', color: '#22c55e' },
  5: { nameKey: 'tasks_meta.graph_embedding', color: '#06b6d4' },
  6: { nameKey: 'tasks_meta.graph_generation', color: '#8b5cf6' },
}

const initialsFor = (form) => {
  const source = (form.full_name || form.username || 'U').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

const fmtDate = (value, locale) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const loading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)
  const { t, lang } = useLanguage()
  const toast = useToast()
  const dateLocale = lang === 'vi' ? 'vi-VN' : 'en-US'

  const [activeTab, setActiveTab] = useState('overview')
  const [form, setForm] = useState(EMPTY_FORM)
  const [savedMessage, setSavedMessage] = useState('')
  const [localError, setLocalError] = useState('')
  const fileInputRef = useRef(null)

  // DB Showcase State
  const [projects, setProjects] = useState([])
  const [datasets, setDatasets] = useState([])
  const [experiments, setExperiments] = useState([])
  const [dbLoading, setDbLoading] = useState(true)

  // Search & Filter state
  const [projectSearch, setProjectSearch] = useState('')
  const [datasetSearch, setDatasetSearch] = useState('')
  const [expSearch, setExpSearch] = useState('')

  useEffect(() => {
    if (!user) return
    setForm({
      email: user.email || '',
      username: user.username || '',
      full_name: user.full_name || '',
      bio: user.bio || '',
      github_url: user.github_url || '',
      organization: user.organization || '',
      job_title: user.job_title || '',
      location: user.location || '',
      profile_image: user.profile_image || '',
    })
  }, [user])

  // Load existing records from DB
  useEffect(() => {
    let active = true
    async function loadDbData() {
      setDbLoading(true)
      try {
        const [projectsPayload, datasetsPayload, experimentsPayload] = await Promise.all([
          apiJson('/projects?page_size=100').catch(() => ({ items: [] })),
          apiJson('/datasets').catch(() => ({ items: [] })),
          apiJson('/experiments?page_size=100').catch(() => ({ items: [] })),
        ])
        if (!active) return
        setProjects(normalizeCollectionPayload(projectsPayload).items)
        setDatasets(normalizeCollectionPayload(datasetsPayload).items)
        setExperiments(normalizeCollectionPayload(experimentsPayload).items)
      } catch (err) {
        console.error('Failed to load profile DB metrics:', err)
      } finally {
        if (active) setDbLoading(false)
      }
    }
    loadDbData()
    return () => { active = false }
  }, [])

  const baseline = useMemo(
    () => ({
      email: user?.email || '',
      username: user?.username || '',
      full_name: user?.full_name || '',
      bio: user?.bio || '',
      github_url: user?.github_url || '',
      organization: user?.organization || '',
      job_title: user?.job_title || '',
      location: user?.location || '',
      profile_image: user?.profile_image || '',
    }),
    [user],
  )

  const isDirty = useMemo(
    () => Object.keys(EMPTY_FORM).some((key) => (form[key] || '') !== (baseline[key] || '')),
    [form, baseline],
  )

  // Stats calculation
  const stats = useMemo(() => {
    return {
      projects: projects.length,
      datasets: datasets.length,
      runs: experiments.length,
    }
  }, [projects, datasets, experiments])

  // GNN Model distribution expertise
  const modelExpertise = useMemo(() => {
    const counts = {}
    let total = 0
    experiments.forEach((exp) => {
      if (!exp.model_type) return
      counts[exp.model_type] = (counts[exp.model_type] || 0) + 1
      total++
    })

    return Object.entries(counts)
      .map(([model, count]) => ({
        model,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [experiments])

  if (!user) {
    return <LoadingState title={t('profile.loading')} className="min-h-[480px]" />
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()
    setSavedMessage('')
    setLocalError('')
    try {
      await updateProfile(form)
      setSavedMessage(t('profile.saved'))
      toast?.showToast(t('profile.saved'), { type: 'success' })
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const handleReset = () => {
    setForm(baseline)
    setLocalError('')
    setSavedMessage('')
  }

  const handleAvatarPick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLocalError(t('profile.invalid_image'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalError(t('profile.image_too_large'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setLocalError('')
      setForm((prev) => ({ ...prev, profile_image: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const displayName = form.full_name || form.username || t('profile.unnamed')
  const initials = initialsFor(form)
  const githubHandle = (form.github_url || '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '')

  // Filtered projects
  const filteredProjects = projects.filter((p) => {
    const s = projectSearch.toLowerCase()
    return p.title?.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s)
  })

  // Filtered datasets
  const filteredDatasets = datasets.filter((d) => {
    const s = datasetSearch.toLowerCase()
    return d.name?.toLowerCase().includes(s) || d.description?.toLowerCase().includes(s)
  })

  // Filtered experiments
  const filteredExperiments = experiments.filter((e) => {
    const s = expSearch.toLowerCase()
    return (
      e.title?.toLowerCase().includes(s) ||
      e.model_type?.toLowerCase().includes(s) ||
      e.dataset_name?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left Column (GitHub-style Sidebar) */}
        <aside className="profile-soft-panel profile-sidebar-panel h-fit space-y-5 p-5 sm:p-6 lg:sticky lg:top-5">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            {/* Avatar Section */}
            <button
              type="button"
              onClick={handleAvatarPick}
              className="profile-avatar-button group relative mb-4 flex h-36 w-36 shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-[1.01] sm:h-44 sm:w-44 lg:h-48 lg:w-48"
              title={t('profile.change_avatar')}
            >
              {form.profile_image ? (
                <img src={form.profile_image} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="profile-avatar-fallback">{initials}</span>
              )}
              <span
                className="profile-avatar-overlay absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-95"
              >
                <Camera size={18} />
                <span>{t('common.change')}</span>
              </span>
            </button>

            {/* Display Name & Handle */}
            <div className="w-full">
              <h1 className="text-2xl font-bold text-white-star leading-tight">{displayName}</h1>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-twilight lg:justify-start">
                <span>@{form.username}</span>
                <span className="profile-role-chip">
                  {user.role || t('profile.role_member').toLowerCase()}
                </span>
              </div>
            </div>

            {/* Bio */}
            {form.bio ? (
              <p className="mt-3 text-sm text-moonlight max-w-xs">{form.bio}</p>
            ) : (
              <p className="mt-3 text-sm italic text-twilight/80">{t('profile.bio_empty')}</p>
            )}

            {/* Edit Profile Button */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="profile-primary-cta mt-4 w-full px-3 py-2 text-xs font-semibold sm:max-w-[220px] lg:max-w-none"
            >
              {t('profile.edit_profile')}
            </button>

            {/* Details List */}
            <div className="profile-soft-divider mt-5 w-full space-y-2.5 pt-4 text-xs text-moonlight">
              {form.job_title || form.organization ? (
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness size={14} className="text-twilight shrink-0" />
                  <span className="truncate">
                    {form.job_title}
                    {form.job_title && form.organization && ' @ '}
                    <span className="font-semibold text-starlight">{form.organization}</span>
                  </span>
                </div>
              ) : null}

              {form.location ? (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-twilight shrink-0" />
                  <span className="truncate">{form.location}</span>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Mail size={14} className="text-twilight shrink-0" />
                <a href={`mailto:${form.email}`} className="truncate hover:text-amethyst hover:underline">
                  {form.email}
                </a>
              </div>

              {form.github_url ? (
                <div className="flex items-center gap-2">
                  <GitBranch size={14} className="text-twilight shrink-0" />
                  <a
                    href={form.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-amethyst hover:underline inline-flex items-center gap-0.5"
                  >
                    <span>{githubHandle}</span>
                    <ExternalLink size={10} className="opacity-60" />
                  </a>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-twilight shrink-0" />
                <span>
                  {t('profile.joined')} {fmtDate(user.created_at, dateLocale)}
                </span>
              </div>
            </div>

            {/* Model expertise */}
            {modelExpertise.length > 0 ? (
              <div className="profile-soft-divider mt-5 w-full pt-4 text-left">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-twilight mb-2.5">
                  {t('profile.expertise_title')}
                </h3>
                <div className="space-y-2">
                  {modelExpertise.slice(0, 3).map((item) => (
                    <div key={item.model} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-starlight">{item.model}</span>
                        <span className="text-twilight">{item.percent}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-void overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amethyst"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Right Column (GitHub-style main content tabs) */}
        <main className="space-y-5 min-w-0">
          {/* Tab bar */}
          <nav className="profile-tabbar sticky top-0 z-10 flex overflow-x-auto py-1 scrollbar-none">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              icon={BookOpen}
              label={t('profile.tab_overview')}
            />
            <TabButton
              active={activeTab === 'projects'}
              onClick={() => setActiveTab('projects')}
              icon={FolderKanban}
              label={t('profile.tab_projects')}
              count={stats.projects}
            />
            <TabButton
              active={activeTab === 'datasets'}
              onClick={() => setActiveTab('datasets')}
              icon={Database}
              label={t('profile.tab_datasets')}
              count={stats.datasets}
            />
            <TabButton
              active={activeTab === 'experiments'}
              onClick={() => setActiveTab('experiments')}
              icon={Activity}
              label={t('profile.tab_experiments')}
              count={stats.runs}
            />
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={SettingsIcon}
              label={t('profile.tab_settings')}
            />
          </nav>

          {/* Tab Contents */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Pinned Projects Section */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-white-star select-none">
                  {t('profile.pinned_items')}
                </h2>
                {dbLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <LoadingCard />
                    <LoadingCard />
                  </div>
                ) : projects.length === 0 ? (
                  <div className="profile-empty-state p-8 text-center text-xs text-twilight">
                    {t('profile.no_projects_desc')}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {projects.slice(0, 4).map((p) => {
                      // Find highest accuracy for runs in this project
                      const projRuns = experiments.filter((e) => e.project_id === p.id)
                      const maxAcc = projRuns.length
                        ? Math.max(...projRuns.map((r) => r.accuracy || 0))
                        : null

                      return (
                        <div
                          key={p.id}
                          className="profile-project-card group relative flex flex-col justify-between p-4 transition-all"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-starlight group-hover:text-amethyst transition-colors text-sm truncate">
                                {p.title}
                              </span>
                              <span className="profile-status-chip shrink-0 px-2 py-0.5 text-[10px] font-semibold capitalize">
                                {p.is_public ? t('profile.public_badge') : t('profile.private_badge')}
                              </span>
                            </div>
                            {p.description && (
                              <p className="mt-2 text-xs text-moonlight line-clamp-2 leading-relaxed">
                                {p.description}
                              </p>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-between text-[11px] text-twilight">
                            <div className="flex items-center gap-1.5">
                              {p.model_type ? (
                                <>
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{
                                      backgroundColor:
                                        p.task_type && TASK_META[p.task_type]?.color
                                          ? TASK_META[p.task_type].color
                                          : 'var(--c-primary)',
                                    }}
                                  />
                                  <span>{p.model_type}</span>
                                </>
                              ) : (
                                <span>GNN Project</span>
                              )}
                            </div>
                            {maxAcc !== null && (
                              <span className="font-mono font-semibold text-emerald-400">
                                Acc: {(maxAcc * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Monthly Activity Section */}
              <section className="profile-soft-panel profile-activity-panel p-4">
                <MonthlyActivity experiments={experiments} t={t} dateLocale={dateLocale} lang={lang} />
              </section>
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-4 animate-fade-in">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-twilight" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="input-cosmic profile-search-input w-full"
                  style={{ paddingLeft: '36px' }}
                />
              </div>

              {dbLoading ? (
                <div className="space-y-3">
                  <LoadingRow />
                  <LoadingRow />
                  <LoadingRow />
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="profile-empty-state p-12 text-center text-xs text-twilight">
                  {t('profile.no_projects_desc')}
                </div>
              ) : (
                <div className="profile-soft-panel overflow-hidden">
                  {filteredProjects.map((p) => {
                    const runCount = experiments.filter((e) => e.project_id === p.id).length
                    return (
                      <div key={p.id} className="profile-list-row flex items-center justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-starlight text-sm truncate">{p.title}</span>
                            <span className="profile-status-chip shrink-0 px-1.5 py-0.2 text-[9px]">
                              {p.is_public ? t('profile.public_badge') : t('profile.private_badge')}
                            </span>
                          </div>
                          {p.description && <p className="text-xs text-moonlight mt-1 line-clamp-1">{p.description}</p>}
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-twilight">
                            {p.model_type && (
                              <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-amethyst" />
                                {p.model_type}
                              </span>
                            )}
                            {p.task_type && TASK_META[p.task_type] && (
                              <span>{t(TASK_META[p.task_type].nameKey)}</span>
                            )}
                            <span>{fmtDate(p.created_at, dateLocale)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center justify-center rounded-full bg-nebula px-2.5 py-1 text-xs font-semibold text-starlight">
                            {runCount} {t('profile.stats_runs').toLowerCase()}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'datasets' && (
            <div className="space-y-4 animate-fade-in">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-twilight" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={datasetSearch}
                  onChange={(e) => setDatasetSearch(e.target.value)}
                  className="input-cosmic profile-search-input w-full"
                  style={{ paddingLeft: '36px' }}
                />
              </div>

              {dbLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <LoadingCard />
                  <LoadingCard />
                </div>
              ) : filteredDatasets.length === 0 ? (
                <div className="profile-empty-state p-12 text-center text-xs text-twilight">
                  {t('profile.no_datasets_desc')}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredDatasets.map((d) => {
                    const summary = d.current_version_summary || {}
                    const nodes = summary.num_nodes ?? '—'
                    const edges = summary.num_edges ?? '—'
                    const versionCount = d.version_count ?? '—'

                    return (
                      <div
                        key={d.id}
                        className="profile-dataset-card flex flex-col justify-between p-4 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="profile-dataset-card__icon">
                            <Database size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-starlight">{d.name}</span>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-twilight">
                                  <span>{versionCount} versions</span>
                                </div>
                              </div>
                              <span className="profile-status-chip shrink-0 px-1.5 py-0.2 text-[9px]">
                                {d.is_public ? t('profile.public_badge') : t('profile.private_badge')}
                              </span>
                            </div>
                            {d.description ? <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-moonlight">{d.description}</p> : null}
                          </div>
                        </div>

                        <div className="profile-dataset-card__stats mt-4">
                          <div className="profile-dataset-stat">
                            <span className="profile-dataset-stat__label">Nodes</span>
                            <span className="profile-dataset-stat__value">{nodes}</span>
                          </div>
                          <div className="profile-dataset-stat">
                            <span className="profile-dataset-stat__label">Edges</span>
                            <span className="profile-dataset-stat__value">{edges}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'experiments' && (
            <div className="space-y-4 animate-fade-in">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-twilight" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={expSearch}
                  onChange={(e) => setExpSearch(e.target.value)}
                  className="input-cosmic profile-search-input w-full"
                  style={{ paddingLeft: '36px' }}
                />
              </div>

              {dbLoading ? (
                <div className="space-y-3">
                  <LoadingRow />
                  <LoadingRow />
                  <LoadingRow />
                </div>
              ) : filteredExperiments.length === 0 ? (
                <div className="profile-empty-state p-12 text-center text-xs text-twilight">
                  {t('profile.no_experiments_desc')}
                </div>
              ) : (
                <div className="profile-soft-panel overflow-hidden">
                  {filteredExperiments.map((e) => {
                    const statusIcon =
                      e.status === 'completed' ? (
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                      ) : e.status === 'failed' ? (
                        <XCircle size={15} className="text-rose-400 shrink-0" />
                      ) : e.status === 'running' ? (
                        <Loader2 size={15} className="animate-spin shrink-0 text-amber-400" />
                      ) : (
                        <AlertCircle size={15} className="text-twilight shrink-0" />
                      )

                    return (
                      <div key={e.id} className="profile-list-row flex items-center justify-between gap-4 p-3.5 text-xs">
                        <div className="flex min-w-0 items-center gap-3">
                          {statusIcon}
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-starlight">{e.title}</span>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-twilight">
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-amethyst">
                                {e.model_type}
                              </span>
                              <span>·</span>
                              <span>Dataset: <span className="font-semibold">{e.dataset_name}</span></span>
                              <span>·</span>
                              <span>{fmtDate(e.created_at, dateLocale)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {e.accuracy ? (
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-twilight">Acc</div>
                              <span className="font-mono font-semibold text-emerald-400">
                                {(e.accuracy * 100).toFixed(1)}%
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
              {/* Display preferences (language + theme) ----------------------- */}
              <FormSection
                icon={Palette}
                title={t('profile.preferences')}
                subtitle={t('profile.preferences_subtitle')}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">
                      <Languages size={13} />
                      <span>{t('profile.language')}</span>
                    </div>
                    <LanguageSwitcher />
                    <p className="mt-2 text-[11px] leading-4 text-text-shadow/80">
                      {t('profile.language_subtitle')}
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">
                      <Palette size={13} />
                      <span>{t('common.settings')}</span>
                    </div>
                    <ThemeToggle />
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={User}
                title={t('profile.identity')}
                subtitle={t('profile.identity_subtitle')}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={t('profile.full_name')}
                    value={form.full_name}
                    onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))}
                    icon={<UserRound size={13} />}
                  />
                  <Field
                    label={t('profile.username')}
                    value={form.username}
                    onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                    icon={<AtSign size={13} />}
                  />
                  <Field
                    label={t('profile.email')}
                    type="email"
                    value={form.email}
                    onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                    icon={<AtSign size={13} />}
                    colSpan="md:col-span-2"
                  />
                </div>
                <FieldTextArea
                  label={t('profile.bio')}
                  value={form.bio}
                  onChange={(value) => setForm((prev) => ({ ...prev, bio: value }))}
                  rows={3}
                  placeholder={t('profile.bio_placeholder')}
                />
              </FormSection>

              <FormSection
                icon={BriefcaseBusiness}
                title={t('profile.workplace')}
                subtitle={t('profile.workplace_subtitle')}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={t('profile.organization')}
                    value={form.organization}
                    onChange={(value) => setForm((prev) => ({ ...prev, organization: value }))}
                    icon={<Building2 size={13} />}
                  />
                  <Field
                    label={t('profile.job_title')}
                    value={form.job_title}
                    onChange={(value) => setForm((prev) => ({ ...prev, job_title: value }))}
                    icon={<BriefcaseBusiness size={13} />}
                  />
                  <Field
                    label={t('profile.location')}
                    value={form.location}
                    onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                    icon={<MapPin size={13} />}
                    colSpan="md:col-span-2"
                  />
                </div>
              </FormSection>

              <FormSection
                icon={LinkIcon}
                title={t('profile.online_presence')}
                subtitle={t('profile.online_subtitle')}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={t('profile.github_url')}
                    value={form.github_url}
                    onChange={(value) => setForm((prev) => ({ ...prev, github_url: value }))}
                    icon={<GitBranch size={13} />}
                    placeholder={t('profile.github_placeholder')}
                  />
                  <Field
                    label={t('profile.avatar_url')}
                    value={form.profile_image}
                    onChange={(value) => setForm((prev) => ({ ...prev, profile_image: value }))}
                    icon={<Camera size={13} />}
                    placeholder={t('profile.avatar_url_placeholder')}
                  />
                </div>
              </FormSection>

              {/* Messages */}
              {localError || authError ? (
                <div className="rounded-lg border border-aurora-rose/25 bg-aurora-rose/[0.08] px-3 py-2 text-sm text-aurora-rose">
                  {localError || authError}
                </div>
              ) : null}
              {savedMessage && !isDirty ? (
                <div className="inline-flex items-center gap-2 rounded-lg border border-aurora-green/25 bg-aurora-green/[0.08] px-3 py-2 text-sm text-aurora-green">
                  <Check size={14} />
                  {savedMessage}
                </div>
              ) : null}

              {/* Sticky save bar -------------------------------------------------- */}
              <div
                className={`sticky bottom-3 z-30 flex justify-end transition-opacity ${isDirty ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <div className="profile-soft-panel pointer-events-auto flex items-center gap-3 px-3 py-2">
                  <span className="text-xs font-semibold text-text-shadow">{t('common.unsaved_changes')}</span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="profile-secondary-button inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold"
                  >
                    {t('common.discard')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-galaxy inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={13} />
                    {loading ? t('common.saving') : t('profile.save_profile')}
                  </button>
                </div>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  )
}

// Subcomponent: GitHub-style tab buttons
function TabButton({ active, onClick, icon: Icon, label, count = undefined }) {
  return (
    <button
      onClick={onClick}
      className={`profile-tab ${active ? 'profile-tab-active' : ''}`}
    >
      <span className={`profile-tab__icon ${active ? 'profile-tab__icon-active' : ''}`}>
        <Icon size={14} />
      </span>
      <span className="profile-tab__label">{label}</span>
      {count !== undefined && (
        <span className={`profile-tab__count ${active ? 'profile-tab__count-active' : ''}`}>{count}</span>
      )}
    </button>
  )
}

// Subcomponent: Form Section
function FormSection({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="profile-soft-panel p-4">
      <header className="profile-soft-divider mb-4 flex items-start gap-3 pb-3">
        <div className="profile-section-icon flex h-9 w-9 items-center justify-center">
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white-star">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-text-shadow">{subtitle}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

// Subcomponent: Text Field
function Field({ label, value, onChange, type = 'text', icon = null, placeholder = '', colSpan = '' }) {
  return (
    <label className={`block ${colSpan}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">
        {icon}
        <span>{label}</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-cosmic profile-form-input w-full"
        placeholder={placeholder}
      />
    </label>
  )
}

// Subcomponent: Text Area
function FieldTextArea({ label, value, onChange, rows = 4, placeholder = '' }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">{label}</div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-cosmic profile-form-input w-full resize-none"
        placeholder={placeholder}
      />
    </label>
  )
}

// Subcomponent: Monthly activity summary list with year navigation
function MonthlyActivity({ experiments = [], t, dateLocale, lang }) {
  const [year, setYear] = useState(new Date().getFullYear())

  const months = useMemo(() => {
    const list = []
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1)
      const label = d.toLocaleDateString(dateLocale, { month: 'long' })
      const shortLabel = lang === 'vi' ? `T${m + 1}` : d.toLocaleDateString(dateLocale, { month: 'short' })
      list.push({
        monthIndex: m,
        label,
        shortLabel,
        count: 0,
      })
    }

    // Count runs in this year and month
    experiments.forEach((exp) => {
      if (!exp.created_at) return
      try {
        const expDate = new Date(exp.created_at)
        if (expDate.getFullYear() === year) {
          const mIdx = expDate.getMonth()
          if (list[mIdx]) {
            list[mIdx].count++
          }
        }
      } catch {
        /* ignore */
      }
    })
    return list
  }, [experiments, year, dateLocale])

  const maxCount = useMemo(() => {
    const counts = months.map((m) => m.count)
    return Math.max(1, ...counts)
  }, [months])

  return (
    <div className="space-y-4 py-1">
      {/* Year navigation header */}
      <div className="profile-soft-divider mb-2 flex select-none items-center justify-between pb-3">
        <h3 className="text-sm font-semibold text-white-star">
          {t('profile.heatmap_title')}
        </h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="profile-year-button"
            title={lang === 'vi' ? 'Năm trước' : 'Previous year'}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-bold text-sm text-starlight select-none min-w-[36px] text-center">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="profile-year-button"
            title={lang === 'vi' ? 'Năm sau' : 'Next year'}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Horizontal Bar Chart (Side-by-side vertical bars) */}
      <div className="profile-activity-chart flex h-48 select-none items-end justify-between gap-2.5 overflow-x-auto px-2 pb-5 pt-10 scrollbar-thin">
        {months.map((m) => (
          <div key={m.monthIndex} className="group flex h-full min-w-[32px] flex-1 flex-col items-center justify-end gap-2">
            {/* Bar + Tooltip Container */}
            <div className="relative flex h-32 w-full flex-col items-center justify-end">
              {m.count > 0 ? (
                <span className="profile-activity-count mb-2 text-[10px] font-bold leading-none text-starlight">
                  {m.count}
                </span>
              ) : null}

              {/* Tooltip on Hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-15 pointer-events-none">
                <span className="profile-activity-tooltip whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold text-white-star">
                  {m.count} {t('profile.stats_runs').toLowerCase()}
                </span>
                <div className="profile-activity-tooltip-arrow -mt-1 h-1.5 w-1.5 rotate-45" />
              </div>

              {/* Vertical Bar Visual */}
              <div
                className={`profile-activity-bar w-full cursor-pointer transition-all duration-300 group-hover:brightness-110 ${
                  m.count > 0 ? 'profile-activity-bar-active' : 'profile-activity-bar-idle'
                }`}
                style={{ height: m.count > 0 ? `${(m.count / maxCount) * 100}%` : '4px' }}
              />
            </div>

            {/* Month label below */}
            <span
              className={`profile-activity-month w-full max-w-full text-center text-[11px] font-semibold leading-none select-none ${
                m.count > 0 ? 'profile-activity-month-active' : 'profile-activity-month-idle'
              }`}
              title={m.label}
            >
              {m.shortLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Skeleton loading row
function LoadingRow() {
  return (
    <div className="profile-soft-panel animate-pulse flex items-center justify-between p-4">
      <div className="flex items-center gap-3 w-3/4">
        <div className="h-3.5 w-3.5 rounded-full bg-nebula" />
        <div className="space-y-1.5 w-1/2">
          <div className="h-3 bg-nebula rounded w-3/4" />
          <div className="h-2 bg-nebula rounded w-1/2" />
        </div>
      </div>
      <div className="h-5 w-16 bg-nebula rounded-full" />
    </div>
  )
}

// Skeleton loading card
function LoadingCard() {
  return (
    <div className="profile-soft-panel animate-pulse space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-nebula rounded w-1/2" />
        <div className="h-3 w-12 bg-nebula rounded-full" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 bg-nebula rounded w-full" />
        <div className="h-2.5 bg-nebula rounded w-5/6" />
      </div>
      <div className="h-2.5 bg-nebula rounded w-1/3 pt-2" />
    </div>
  )
}
