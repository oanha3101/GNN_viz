import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

const STATUS_COLORS = {
  running: 'bg-amethyst',
  completed: 'bg-aurora-green',
  failed: 'bg-aurora-rose',
  stopped: 'bg-aurora-amber',
  queued: 'bg-aurora-blue',
}

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
    <SectionCard
      title="Session Monitor"
      subtitle="Stop or retry sessions without touching the database or the server console."
      actions={
        <button
          type="button"
          onClick={load}
          className="btn-ghost inline-flex items-center gap-2 text-xs"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      }
    >
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[item.status] || 'bg-twilight'}`} />
                    <span className="text-base font-semibold text-white-star font-mono text-sm">{item.id}</span>
                  </div>
                  <div className="mt-1 text-sm text-twilight">
                    {item.task_type} • {item.model_type} • {item.dataset_name}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, 'stop')}
                    className="rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-xs font-semibold text-aurora-rose transition-all hover:bg-aurora-rose/[0.15]"
                  >
                    Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, 'retry')}
                    className="rounded-lg border border-aurora-green/20 bg-aurora-green/[0.08] px-3 py-2 text-xs font-semibold text-aurora-green transition-all hover:bg-aurora-green/[0.15]"
                  >
                    Retry
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-text-shadow md:grid-cols-2 xl:grid-cols-4">
                <span>Status: <span className="text-starlight">{item.status}</span></span>
                <span>Epoch: <span className="text-starlight">{item.last_epoch}/{item.total_epochs}</span></span>
                <span>Started: <span className="text-starlight">{item.started_at || 'n/a'}</span></span>
                <span className={item.error_message ? 'text-aurora-rose' : ''}>
                  {item.error_message ? `Error: ${item.error_message}` : 'No error'}
                </span>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-aurora-rose">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No sessions found" description="Live and historical training sessions will appear here once they exist." />
      )}
    </SectionCard>
  )
}
