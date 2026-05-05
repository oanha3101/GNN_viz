import { ArrowRight, BookOpen, Database, LayoutDashboard, LogOut, Network, ShieldCheck } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const APP_NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/projects', label: 'Projects', icon: ArrowRight },
  { to: '/app/datasets', label: 'Datasets', icon: Database },
  { to: '/app/experiments', label: 'Experiments', icon: BookOpen },
  { to: '/app/lab', label: 'Lab', icon: Network },
]

const TITLES = {
  '/app/dashboard': {
    eyebrow: 'Workspace',
    title: 'Research Dashboard',
    description: 'Project context, dataset context, and the next step before training.',
  },
  '/app/projects': {
    eyebrow: 'Projects',
    title: 'Project Governance',
    description: 'Create and select the project container that owns your runs.',
  },
  '/app/datasets': {
    eyebrow: 'Datasets',
    title: 'Dataset Library',
    description: 'Manage dataset records, versions, publish state, and trainable context.',
  },
  '/app/experiments': {
    eyebrow: 'Experiments',
    title: 'Experiment Hub',
    description: 'Replay, compare, annotate, and export finished runs from one route.',
  },
}

function AppNavLink({ item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
          isActive
            ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
            : 'border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-100'
        }`
      }
    >
      <Icon size={16} />
      <span className="font-medium">{item.label}</span>
    </NavLink>
  )
}

function UserBadge({ user }) {
  return (
    <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Signed In</div>
      <div className="mt-3 text-sm font-semibold text-white">{user?.username || 'Unknown user'}</div>
      <div className="mt-1 text-xs text-slate-400">{user?.email || 'No email available'}</div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
        <ShieldCheck size={12} /> {user?.role || 'viewer'}
      </div>
    </div>
  )
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  if (location.pathname === '/app/lab') {
    return <Outlet />
  }

  const titleMeta = TITLES[location.pathname] || TITLES['/app/dashboard']

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-slate-800/80 bg-[linear-gradient(180deg,rgba(8,15,31,0.98),rgba(2,6,23,1))] px-6 py-8 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-950/40">
              <Network size={20} className="text-white" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">GNN-Insight</div>
              <div className="mt-1 text-sm text-slate-400">Research workspace</div>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {APP_NAV_ITEMS.map((item) => (
              <AppNavLink key={item.to} item={item} />
            ))}
          </nav>

          <div className="mt-8 space-y-4">
            <UserBadge user={user} />
            {user?.role === 'admin' ? (
              <button
                onClick={() => navigate('/admin/overview')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300"
              >
                <ShieldCheck size={15} /> Open admin area
              </button>
            ) : null}
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
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">{titleMeta.eyebrow}</div>
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
