import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw, ScrollText, Search, User2 } from 'lucide-react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { buildAdminListPath } from './AdminListControls'
import { AdminPagination, PAGE_SIZE_OPTIONS, relativeDate } from './AdminPrimitives'

function actionTone(action) {
  const a = (action || '').toLowerCase()
  if (a.includes('delete') || a.includes('remove')) return 'bg-rose-500/12 text-rose-700 border-rose-500/25 dark:text-rose-300'
  if (a.includes('create') || a.includes('add')) return 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25 dark:text-emerald-300'
  if (a.includes('update') || a.includes('edit') || a.includes('patch')) return 'bg-sky-500/12 text-sky-700 border-sky-500/25 dark:text-sky-300'
  if (a.includes('role') || a.includes('promote')) return 'bg-violet-500/12 text-violet-700 border-violet-500/25 dark:text-violet-300'
  if (a.includes('retention') || a.includes('archive')) return 'bg-amber-500/12 text-amber-700 border-amber-500/25 dark:text-amber-300'
  return 'bg-slate-500/12 text-slate-700 border-slate-500/25 dark:text-slate-200'
}

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    action: '',
    target_type: '',
    page: 1,
    page_size: 12,
  })
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 12 })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson(buildAdminListPath('/admin/audit-logs', filters))
      const normalized = normalizeCollectionPayload(payload)
      setItems(normalized.items)
      setMeta({ total: normalized.total, page: normalized.page, page_size: normalized.page_size })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const uniqueActors = useMemo(() => new Set(items.map((i) => i.actor_user_id).filter(Boolean)).size, [items])

  return (
    <div className="space-y-4">
      <header className="admin-list-hero">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="admin-list-hero-icon"><ScrollText size={18} /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Audit Activity</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{meta.total}</span> events · <span className="font-semibold">{uniqueActors}</span> actors here
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="admin-btn-secondary"><RefreshCw size={13} /><span className="hidden sm:inline">Refresh</span></button>
          </div>
        </div>
        <div className="admin-filter-strip">
          <label className="admin-search">
            <Search size={13} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
              placeholder="Search by actor, target id, action..."
              className="admin-search-input"
            />
          </label>
          <input
            value={filters.action}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value, page: 1 }))}
            placeholder="Filter action"
            className="admin-select"
          />
          <input
            value={filters.target_type}
            onChange={(event) => setFilters((prev) => ({ ...prev, target_type: event.target.value, page: 1 }))}
            placeholder="Filter target type"
            className="admin-select"
          />
          <select
            value={filters.page_size}
            onChange={(event) => setFilters((prev) => ({ ...prev, page_size: Number(event.target.value), page: 1 }))}
            className="admin-select"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option} / page</option>
            ))}
          </select>
        </div>
      </header>

      {loading ? (
        <LoadingState title="Loading audit activity..." className="min-h-[320px]" />
      ) : error && items.length === 0 ? (
        <ErrorState title="Could not load audit log" error={error} onRetry={load} className="min-h-[320px]" />
      ) : items.length === 0 ? (
        <div className="admin-card">
          <EmptyState title="No audit activity" description="Audit entries will appear once governance actions occur." />
        </div>
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-th admin-th-lead">Action</th>
                  <th className="admin-th">Target</th>
                  <th className="admin-th">Actor</th>
                  <th className="admin-th">When</th>
                  <th className="admin-th admin-th-actions">Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expanded = expandedId === item.id
                  return (
                    <Fragment key={item.id}>
                      <tr className="admin-tr">
                        <td className="admin-td">
                          <span className={`admin-role-pill ${actionTone(item.action)}`}>{item.action || 'event'}</span>
                        </td>
                        <td className="admin-td">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.target_type || '—'}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">#{item.target_id || 'n/a'}</span>
                          </div>
                        </td>
                        <td className="admin-td">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
                            <User2 size={11} className="opacity-60" />
                            {item.actor_user_id || 'system'}
                          </span>
                        </td>
                        <td className="admin-td">
                          <span className="text-xs text-slate-600 dark:text-slate-300">{relativeDate(item.created_at)}</span>
                        </td>
                        <td className="admin-td admin-td-actions">
                          {item.details_json ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                              className="admin-icon-btn"
                              title={expanded ? 'Hide details' : 'Show details'}
                              aria-expanded={expanded}
                            >
                              <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded && item.details_json ? (
                        <tr className="admin-tr">
                          <td colSpan={5} className="admin-td">
                            <pre className="max-h-48 overflow-auto rounded-lg border border-line-subtle/40 bg-slate-50 p-3 font-mono text-[11px] text-slate-700 dark:border-cyan-400/15 dark:bg-slate-900/60 dark:text-slate-200">
                              {JSON.stringify(item.details_json, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={meta.page}
            pageSize={meta.page_size}
            total={meta.total}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      )}
    </div>
  )
}
