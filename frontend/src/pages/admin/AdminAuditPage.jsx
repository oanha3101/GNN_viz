import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { AdminListToolbar, AdminPagination, buildAdminListPath } from './AdminListControls'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [filters, setFilters] = useState({
    q: '',
    action: '',
    target_type: '',
    date_from: '',
    date_to: '',
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
      setMeta({
        total: normalized.total,
        page: normalized.page,
        page_size: normalized.page_size,
      })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <LoadingState title="Loading audit activity..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load audit log" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Audit Activity" subtitle="Operational history for role changes, retention, session actions, and governance flows.">
      <AdminListToolbar
        searchValue={filters.q}
        onSearchChange={(value) => setFilters((prev) => ({ ...prev, q: value, page: 1 }))}
        searchPlaceholder="Search by action, target type, target id"
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onDateFromChange={(value) => setFilters((prev) => ({ ...prev, date_from: value, page: 1 }))}
        onDateToChange={(value) => setFilters((prev) => ({ ...prev, date_to: value, page: 1 }))}
        onPageSizeChange={(value) => setFilters((prev) => ({ ...prev, page_size: value, page: 1 }))}
        onRefresh={load}
        onClear={() => setFilters({ q: '', action: '', target_type: '', date_from: '', date_to: '', page: 1, page_size: meta.page_size || 12 })}
        pageSize={filters.page_size}
        showDateFilters
        extraControls={
          <>
            <input
              value={filters.action}
              onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value, page: 1 }))}
              placeholder="Action"
              className="input-cosmic text-sm"
            />
            <input
              value={filters.target_type}
              onChange={(event) => setFilters((prev) => ({ ...prev, target_type: event.target.value, page: 1 }))}
              placeholder="Target type"
              className="input-cosmic text-sm"
            />
          </>
        }
      />
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amethyst" />
                <span className="text-base font-semibold text-white-star">{item.action}</span>
                <span className="badge-cosmic">{item.target_type}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-text-shadow">
                <span>target: <span className="text-starlight">{item.target_id || 'n/a'}</span></span>
                <span>actor: <span className="text-starlight">{item.actor_user_id || 'system'}</span></span>
                <span className="text-twilight">{item.created_at || 'n/a'}</span>
              </div>
              {item.details_json ? (
                <pre className="mt-3 overflow-auto rounded-lg border border-line-subtle bg-deep p-4 text-xs text-starlight font-mono max-h-48">
                  {JSON.stringify(item.details_json, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No audit activity" description="Audit entries will appear here once governance or admin actions occur." />
      )}
      <AdminPagination
        page={meta.page}
        pageSize={meta.page_size}
        total={meta.total}
        onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
      />
    </SectionCard>
  )
}
