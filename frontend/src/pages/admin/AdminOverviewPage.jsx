import { useEffect, useState } from 'react'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson } from '../../utils/api'
import { SectionCard, StatCard } from '../shared/PageBlocks'

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const payload = await apiJson('/admin/summary')
        if (active) setSummary(payload)
      } catch (err) {
        if (active) setError(err)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <LoadingState title="Loading admin summary..." className="min-h-[480px]" />
  }

  if (error) {
    return <ErrorState title="Could not load admin summary" error={error} onRetry={() => window.location.reload()} className="min-h-[480px]" />
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={summary?.users ?? 0} />
        <StatCard label="Projects" value={summary?.projects ?? 0} tone="emerald" />
        <StatCard label="Experiments" value={summary?.experiments ?? 0} />
        <StatCard label="Sessions" value={summary?.training_sessions ?? 0} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active Sessions" value={summary?.active_sessions ?? 0} tone="emerald" />
        <StatCard label="Failed 7 Days" value={summary?.failed_sessions_recent ?? 0} tone="red" />
        <StatCard label="Compacted Runs" value={summary?.retention_compacted_runs ?? 0} tone="amber" />
      </div>

      <SectionCard title="Operational Summary" subtitle="A quick read before drilling into users, datasets, runs, or retention actions.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryRow label="Datasets" value={summary?.datasets ?? 0} />
          <SummaryRow label="Dataset Versions" value={summary?.dataset_versions ?? 0} />
          <SummaryRow label="Experiments" value={summary?.experiments ?? 0} />
          <SummaryRow label="Sessions" value={summary?.training_sessions ?? 0} />
        </div>
      </SectionCard>

      <SectionCard title="Infrastructure Surface" subtitle="Quick visibility into the storage and cache services backing the current workspace.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryRow label="Blob Provider" value={summary?.blob_provider || 'local'} />
          <SummaryRow label="Mongo Ready" value={summary?.mongo_available ? 'online' : 'offline'} />
          <SummaryRow label="Redis Ready" value={summary?.redis_available ? 'online' : 'offline'} />
          <SummaryRow label="Audit 7 Days" value={summary?.recent_audit_events ?? 0} />
        </div>
      </SectionCard>
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-xl font-bold text-white">{value}</div>
    </div>
  )
}
