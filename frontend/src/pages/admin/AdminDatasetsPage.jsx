import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

export default function AdminDatasetsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/datasets')
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
    return <LoadingState title="Loading governed datasets..." className="min-h-[480px]" />
  }

  if (error && items.length === 0) {
    return <ErrorState title="Could not load datasets" error={error} onRetry={load} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="Dataset Governance" subtitle="Track lifecycle and usage concentration across the workspace.">
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="glass-card p-5">
              <div className="text-base font-semibold text-white-star">{item.name}</div>
              <div className="mt-1 text-sm text-twilight">Slug: {item.slug}</div>
              <div className="mt-3 grid gap-2 text-xs text-text-shadow md:grid-cols-2 xl:grid-cols-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-moonlight" />
                  Versions: {item.version_count}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-aurora-cyan" />
                  Usage: {item.usage_count}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.is_public ? 'bg-aurora-green' : 'bg-aurora-amber'}`} />
                  {item.is_public ? 'Public' : 'Private'}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-moonlight" />
                  Current: {item.current_version ? `v${item.current_version.version} (${item.current_version.lifecycle})` : 'n/a'}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No governed datasets" description="Governed dataset inventory will appear here once dataset records are created." />
      )}
    </SectionCard>
  )
}
