import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminAuditPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/audit-logs')
      setItems(normalizeCollectionPayload(payload).items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

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
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-5">
              <div className="text-base font-semibold text-white">{item.action} • {item.target_type}</div>
              <div className="mt-1 text-sm text-slate-400">target={item.target_id || 'n/a'} • actor={item.actor_user_id || 'system'}</div>
              <div className="mt-2 text-xs text-slate-500">{item.created_at || 'n/a'}</div>
              {item.details_json ? (
                <pre className="mt-3 overflow-auto rounded-2xl border border-slate-800/70 bg-slate-950/80 p-4 text-[11px] text-slate-300">
                  {JSON.stringify(item.details_json, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No audit activity" description="Audit entries will appear here once governance or admin actions occur." />
      )}
    </SectionCard>
  )
}
