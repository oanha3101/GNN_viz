import { Activity, ArrowRight, Database, FileClock, FolderKanban, LogOut, Shield, Users } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const ADMIN_NAV_ITEMS = [
  { to: '/admin/overview', label: 'Overview', icon: Shield },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/datasets', label: 'Datasets', icon: Database },
  { to: '/admin/experiments', label: 'Experiments', icon: FolderKanban },
  { to: '/admin/sessions', label: 'Sessions', icon: Activity },
  { to: '/admin/retention', label: 'Retention', icon: Shield },
  { to: '/admin/audit', label: 'Audit', icon: FileClock },
]

const TITLES = {
  '/admin/overview': {
    eyebrow: 'Admin',
    title: 'System Overview',
    description: 'Monitor platform health, storage pressure, and recent operational activity.',
  },
  '/admin/users': {
    eyebrow: 'Admin',
    title: 'User Management',
    description: 'Review accounts, adjust roles, and govern who can train or mutate data.',
  },
  '/admin/datasets': {
    eyebrow: 'Admin',
    title: 'Dataset Governance',
    description: 'Track version usage, visibility, and lifecycle across the workspace.',
  },
  '/admin/experiments': {
    eyebrow: 'Admin',
    title: 'Experiment Governance',
    description: 'Inspect run quality, retention state, and experiment-level metadata.',
  },
  '/admin/sessions': {
    eyebrow: 'Admin',
    title: 'Session Monitor',
    description: 'Stop, retry, and inspect live or failed training sessions from one shell.',
  },
  '/admin/retention': {
    eyebrow: 'Admin',
    title: 'Retention Monitor',
    description: 'Preview and apply compaction policy before Mongo growth becomes a problem.',
  },
  '/admin/audit': {
    eyebrow: 'Admin',
    title: 'Audit Activity',
    description: 'Read the operational trail for auth, governance, retention, and admin actions.',
  },
}

function AdminNavLink({ item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
          isActive
            ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
            : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-100'
        }`
      }
    >
      <Icon size={16} />
      <span className="font-medium">{item.label}</span>
    </NavLink>
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const titleMeta = TITLES[location.pathname] || TITLES['/admin/overview']

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="border-b border-slate-800/80 bg-[linear-gradient(180deg,rgba(14,10,6,0.96),rgba(2,6,23,1))] px-6 py-8 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-950/40">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Admin Shell</div>
              <div className="mt-1 text-sm text-slate-400">Operational control</div>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {ADMIN_NAV_ITEMS.map((item) => (
              <AdminNavLink key={item.to} item={item} />
            ))}
          </nav>

          <div className="mt-8 space-y-4 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Operator</div>
            <div className="mt-3 text-sm font-semibold text-white">{user?.username || 'Admin user'}</div>
            <div className="mt-1 text-xs text-slate-400">{user?.email || 'No email available'}</div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
              <Shield size={12} /> {user?.role || 'admin'}
            </div>
            <button
              onClick={() => navigate('/app/dashboard')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-300"
            >
              <ArrowRight size={15} /> Back to research shell
            </button>
            <button
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-200"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-800/70 bg-slate-950/60 px-6 py-6 backdrop-blur">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">{titleMeta.eyebrow}</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{titleMeta.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{titleMeta.description}</p>
          </header>

          <main className="flex-1 p-6">
            <div className="min-h-[calc(100vh-11rem)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
