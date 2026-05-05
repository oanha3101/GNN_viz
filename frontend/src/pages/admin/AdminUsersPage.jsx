import { useCallback, useEffect, useState } from 'react'
import EmptyState from '../../components/primitives/EmptyState'
import ErrorState from '../../components/primitives/ErrorState'
import LoadingState from '../../components/primitives/LoadingState'
import { apiJson, normalizeCollectionPayload } from '../../utils/api'
import { SectionCard } from '../shared/PageBlocks'

const ROLE_OPTIONS = ['admin', 'researcher', 'viewer']

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [users, setUsers] = useState([])
  const [roleDrafts, setRoleDrafts] = useState({})

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiJson('/admin/users')
      const items = normalizeCollectionPayload(payload).items
      setUsers(items)
      setRoleDrafts(Object.fromEntries(items.map((item) => [item.id, item.role])))
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleSave = useCallback(async (userId) => {
    try {
      await apiJson(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: roleDrafts[userId] }),
      })
      await loadUsers()
    } catch (err) {
      setError(err)
    }
  }, [loadUsers, roleDrafts])

  if (loading) {
    return <LoadingState title="Loading users..." className="min-h-[480px]" />
  }

  if (error && users.length === 0) {
    return <ErrorState title="Could not load users" error={error} onRetry={loadUsers} className="min-h-[480px]" />
  }

  return (
    <SectionCard title="User Management" subtitle="Adjust roles without leaving the admin shell.">
      {users.length ? (
        <div className="space-y-3">
          {users.map((item) => (
            <div key={item.id} className="rounded-3xl border border-slate-800/70 bg-slate-950/50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-white">{item.username} ({item.role})</div>
                  <div className="mt-1 text-sm text-slate-400">{item.email}</div>
                  <div className="mt-3 text-xs text-slate-500">ID: {item.id} • Created: {item.created_at || 'n/a'} • {item.is_active ? 'Active' : 'Disabled'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={roleDrafts[item.id] || item.role}
                    onChange={(event) => setRoleDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
                    className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleSave(item.id)}
                    className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300"
                  >
                    Save role
                  </button>
                </div>
              </div>
            </div>
          ))}
          {error ? <div className="text-sm text-red-300">{error.message}</div> : null}
        </div>
      ) : (
        <EmptyState title="No users found" description="User accounts will appear here once people start using the workspace." />
      )}
    </SectionCard>
  )
}
