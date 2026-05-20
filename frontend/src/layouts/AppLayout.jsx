import {
  BookOpen,
  Database,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import ThemeToggle from '../components/ui/ThemeToggle'

const APP_NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/projects', label: 'Projects', icon: FolderKanban },
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
  '/app/profile': {
    eyebrow: 'Profile',
    title: 'My Profile',
    description: 'Manage your public identity and research details inside the workspace.',
  },
  '/app/datasets': {
    eyebrow: 'Datasets',
    title: 'Dataset Library',
    description: 'Manage dataset records, versions, publish state, and trainable context.',
  },
}

function AppNavLink({ item }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `app-nav-link ${isActive ? 'app-nav-link-active' : ''}`}
    >
      {({ isActive }) => (
        <>
          <Icon size={17} className={isActive ? 'text-white' : 'text-twilight'} />
          <span className="font-semibold">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function UserBadge({ user, navigate }) {
  const avatarLabel = (user?.full_name || user?.username || 'U')[0].toUpperCase()
  return (
    <button
      type="button"
      onClick={() => navigate('/app/profile')}
      className="app-user-badge text-left transition-colors hover:border-line-active"
    >
      <div className="app-user-avatar">
        {user?.profile_image ? (
          <img
            src={user.profile_image}
            alt={user?.username || 'User avatar'}
            className="h-full w-full rounded-[16px] object-cover"
          />
        ) : (
          <span className="text-sm font-bold text-white">
            {avatarLabel}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white-star">
          {user?.full_name || user?.username || 'Unknown'}
        </div>
        <div className="truncate text-[11px] text-text-shadow">
          {user?.email || 'No email'}
        </div>
      </div>
      <span className="app-role-tag">{user?.role || 'viewer'}</span>
    </button>
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

  const titleMeta = TITLES[location.pathname]

  return (
    <div className="user-shell min-h-screen bg-abyss text-starlight selection:bg-accent-amethyst/30 print:bg-white print:text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr] print:block print:min-h-0">
        <aside className="app-sidebar print:hidden">
          <div className="relative z-10 flex h-full flex-col px-5 py-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="app-logo-icon">
                <Network size={18} className="text-white" />
              </div>
              <div>
                <div className="app-brand-title">GNN Insight</div>
                <div className="app-brand-subtitle">Research workspace</div>
              </div>
            </div>

            <nav className="space-y-2">
              {APP_NAV_ITEMS.map((item) => (
                <AppNavLink key={item.to} item={item} />
              ))}
            </nav>

            <div className="mt-4 space-y-3 border-t border-line-subtle pt-4">
              <UserBadge user={user} navigate={navigate} />

              <div className="flex flex-col gap-2">
                {user?.role === 'admin' ? (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/overview')}
                    className="app-action-btn app-action-btn-admin"
                  >
                    <ShieldCheck size={14} />
                    Admin
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="app-action-btn app-action-btn-logout"
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="relative flex min-h-screen flex-col overflow-hidden print:min-h-0 print:overflow-visible">
          <div className="user-shell-backdrop pointer-events-none absolute inset-0 print:hidden" />

          {titleMeta ? (
            <header className="app-header flex items-start justify-between gap-4 print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-amethyst" />
                  <span className="text-micro font-semibold uppercase tracking-ultra text-twilight">
                    {titleMeta.eyebrow}
                  </span>
                </div>
                <h1 className="mt-2 text-[2rem] font-bold tracking-tight text-white-star">
                  {titleMeta.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-twilight">
                  {titleMeta.description}
                </p>
              </div>
              <div className="shrink-0">
                <ThemeToggle />
              </div>
            </header>
          ) : (
            <div className="flex justify-end px-6 pt-6">
              <ThemeToggle />
            </div>
          )}

          <main className="relative z-10 flex-1 overflow-auto p-6">
            <div className="min-h-[calc(100vh-10rem)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
