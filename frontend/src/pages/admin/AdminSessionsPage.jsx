import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminSessionsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/sessions')
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

  const handleAction = useCallback(async (sessionId, action) => {
    try {
      await apiJson(`/admin/sessions/${sessionId}/${action}`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(err)
    }
  }, [load])

  if (loading) {
    return <LoadingState title="Loading sessions..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load sessions" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Session Monitor" subtitle="Stop or retry sessions without touching the database or the server console.">
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-white">{item.id}</div>
                  <div className="mt-1 text-sm text-slate-400">Task {item.task_type} • {item.model_type} • {item.dataset_name}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, 'stop')}
                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, 'retry')}
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300"
                  >
                    Retry
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                <span>Status: {item.status}</span>
                <span>Epoch: {item.last_epoch}/{item.total_epochs}</span>
                <span>Started: {item.started_at || 'n/a'}</span>
                <span>{item.error_message ? `Error: ${item.error_message}` : 'No error'}</span>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-red-300">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No sessions found" description="Live and historical training sessions will appear here once they exist." />
      )}
    </SectionCard>
  )
}
