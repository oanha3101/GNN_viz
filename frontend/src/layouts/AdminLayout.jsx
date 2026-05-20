import { Activity, ArrowRight, Database, FileClock, FolderKanban, LogOut, Moon, Shield, Sparkles, SunMedium, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const ADMIN_NAV_ITEMS = [
  { to: '/admin/overview', label: 'Overview', icon: Shield },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
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
  '/admin/projects': {
    eyebrow: 'Admin',
    title: 'Project Governance',
    description: 'Review project containers, visibility, and whether runs are still attached to them.',
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
        `admin-nav-link ${isActive ? 'admin-nav-link-active' : ''}`
      }
    >
      <Icon size={15} />
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
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('gnnAdminTheme') || 'dark'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('gnnAdminTheme', theme)
  }, [theme])

  return (
    <div className={`admin-shell admin-theme-${theme} min-h-screen bg-abyss text-starlight`}>
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        {/* ── Sidebar ── */}
        <aside className="app-sidebar admin-sidebar lg:sticky lg:top-0 lg:h-screen">
          {/* Amber-tinted particles */}
          <div className="sidebar-cosmos">
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="sidebar-particle admin-particle"
                style={{
                  '--px': `${10 + Math.random() * 80}%`,
                  '--py': `${Math.random() * 100}%`,
                  '--ps': `${Math.random() * 2.5 + 0.8}px`,
                  '--pdur': `${Math.random() * 8 + 5}s`,
                  '--pdel': `${Math.random() * -8}s`,
                }}
              />
            ))}
            {/* Subtle constellation lines */}
            <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
              <line x1="20%" y1="15%" x2="70%" y2="30%" stroke="rgba(251,191,36,0.12)" strokeWidth="0.5" />
              <line x1="70%" y1="30%" x2="40%" y2="55%" stroke="rgba(251,191,36,0.1)" strokeWidth="0.5" />
              <line x1="40%" y1="55%" x2="80%" y2="75%" stroke="rgba(251,191,36,0.08)" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="relative z-10 flex h-full min-h-0 flex-col px-4 py-5">
            {/* Logo */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="app-logo-icon admin-logo-icon">
                  <Shield size={16} className="text-white" />
                </div>
                <div>
                  <div className="admin-brand-title text-[11px] font-bold uppercase tracking-[0.2em] text-aurora-amber">Admin Shell</div>
                  <div className="admin-brand-subtitle text-[9px] text-text-shadow">Operational control</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="admin-theme-toggle"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <SunMedium size={14} /> : <Moon size={14} />}
              </button>
            </div>

            {/* Nav */}
            <nav className="admin-scrollbar mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {ADMIN_NAV_ITEMS.map((item) => (
                <AdminNavLink key={item.to} item={item} />
              ))}
            </nav>

            {/* User + Actions */}
            <div className="mt-4 space-y-2 border-t border-line-subtle/70 pt-4">
              <div className="app-user-badge admin-user-badge">
                <div className="app-user-avatar admin-user-avatar">
                  <span className="text-sm font-bold text-white">
                    {(user?.username || 'A')[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white-star truncate">{user?.username || 'Admin'}</div>
                  <div className="text-[10px] text-text-shadow truncate">{user?.email || 'No email'}</div>
                </div>
                <span className="app-role-tag admin-role-tag">
                  {user?.role || 'admin'}
                </span>
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => navigate('/app/dashboard')}
                  className="app-action-btn admin-action-btn"
                >
                  <ArrowRight size={13} /> Research Shell
                </button>
                <button
                  onClick={() => {
                    logout()
                    navigate('/login', { replace: true })
                  }}
                  className="app-action-btn app-action-btn-logout"
                >
                  <LogOut size={13} /> Log out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Area ── */}
        <div className="flex min-h-screen flex-col relative">
          {/* Electric constellation background — amber tint */}
          <div className="app-content-cosmos">
            <svg className="app-content-lines" viewBox="0 0 1200 800" preserveAspectRatio="none">
              <defs>
                <linearGradient id="admin-line-1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(251,191,36,0)" />
                  <stop offset="50%" stopColor="rgba(251,191,36,0.3)" />
                  <stop offset="100%" stopColor="rgba(251,191,36,0)" />
                </linearGradient>
                <linearGradient id="admin-line-2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(234,88,12,0)" />
                  <stop offset="50%" stopColor="rgba(234,88,12,0.25)" />
                  <stop offset="100%" stopColor="rgba(251,191,36,0)" />
                </linearGradient>
                <filter id="admin-edge-glow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Cluster 1 */}
              <line x1="80" y1="120" x2="250" y2="200" stroke="url(#admin-line-1)" strokeWidth="1" filter="url(#admin-edge-glow)" className="app-bg-line" />
              <line x1="250" y1="200" x2="180" y2="350" stroke="url(#admin-line-1)" strokeWidth="1" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-2s' }} />
              <line x1="250" y1="200" x2="420" y2="150" stroke="url(#admin-line-2)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-1s' }} />
              <line x1="420" y1="150" x2="380" y2="320" stroke="url(#admin-line-2)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-4s' }} />

              {/* Cluster 2 */}
              <line x1="850" y1="150" x2="1000" y2="250" stroke="url(#admin-line-1)" strokeWidth="1" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-5s' }} />
              <line x1="1000" y1="250" x2="1100" y2="180" stroke="url(#admin-line-1)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-7s' }} />
              <line x1="1000" y1="250" x2="1050" y2="420" stroke="url(#admin-line-2)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-8s' }} />

              {/* Cluster 3 */}
              <line x1="200" y1="550" x2="400" y2="620" stroke="url(#admin-line-2)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-3s' }} />
              <line x1="400" y1="620" x2="600" y2="560" stroke="url(#admin-line-2)" strokeWidth="0.8" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-6s' }} />

              {/* Bridges */}
              <line x1="420" y1="150" x2="700" y2="280" stroke="url(#admin-line-1)" strokeWidth="0.4" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-9s' }} />
              <line x1="700" y1="280" x2="850" y2="150" stroke="url(#admin-line-1)" strokeWidth="0.4" filter="url(#admin-edge-glow)" className="app-bg-line" style={{ animationDelay: '-10s' }} />
            </svg>

            {[
              { x: 80, y: 120, s: 4 }, { x: 250, y: 200, s: 5 }, { x: 180, y: 350, s: 3 },
              { x: 420, y: 150, s: 4 }, { x: 380, y: 320, s: 3 },
              { x: 850, y: 150, s: 4 }, { x: 1000, y: 250, s: 5 }, { x: 1100, y: 180, s: 3 },
              { x: 1050, y: 420, s: 3 },
              { x: 200, y: 550, s: 3 }, { x: 400, y: 620, s: 4 }, { x: 600, y: 560, s: 3 },
              { x: 700, y: 280, s: 2 }, { x: 1100, y: 600, s: 2 },
            ].map((n, i) => (
              <div
                key={i}
                className="app-bg-node admin-bg-node"
                style={{
                  left: `${(n.x / 1200) * 100}%`,
                  top: `${(n.y / 800) * 100}%`,
                  width: `${n.s}px`,
                  height: `${n.s}px`,
                  animationDelay: `${i * -1.5}s`,
                  animationDuration: `${5 + (i % 3) * 2}s`,
                }}
              />
            ))}

            {/* Electric sparks */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`admin-spark-${i}`}
                className="app-bg-electric-spark admin-bg-node"
                style={{
                  '--ex': `${10 + Math.random() * 80}%`,
                  '--ey': `${Math.random() * 100}%`,
                  '--edur': `${Math.random() * 15 + 10}s`,
                  '--edel': `${Math.random() * -10}s`,
                }}
              />
            ))}
          </div>

          {/* Header */}
          <header className="app-header admin-header">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-aurora-amber" />
                  <span className="text-micro font-semibold uppercase tracking-ultra text-aurora-amber">{titleMeta.eyebrow}</span>
                </div>
                <h1 className="admin-page-title mt-1.5 text-xl font-black text-white-star">{titleMeta.title}</h1>
                <p className="admin-page-subtitle mt-1 max-w-2xl text-xs leading-5 text-twilight">{titleMeta.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="admin-theme-toggle admin-theme-toggle-header"
              >
                {theme === 'dark' ? <SunMedium size={14} /> : <Moon size={14} />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
            </div>
          </header>

          {/* Content */}
          <main className="relative z-10 flex-1 p-6">
            <div className="min-h-[calc(100vh-9rem)]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
