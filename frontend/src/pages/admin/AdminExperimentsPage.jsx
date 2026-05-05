import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminExperimentsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/experiments')
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
    return <LoadingState title="Loading experiments..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load experiments" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Experiment Governance" subtitle="Review run status, retention state, and model context from the admin shell.">
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-5">
              <div className="text-base font-semibold text-white">{item.title}</div>
              <div className="mt-1 text-sm text-slate-400">Task {item.task_type} • {item.model_type} • {item.dataset_name}</div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2 xl:grid-cols-4">
                <span>Epochs: {item.epoch_count}</span>
                <span>Best epoch: {item.best_epoch}</span>
                <span>Status: {item.status}</span>
                <span>Retention: {item.retention_state}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No experiments found" description="Saved experiments will appear here once runs complete and persist into the hybrid store." />
      )}
    </SectionCard>
  )
}
