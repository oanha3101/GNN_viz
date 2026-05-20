import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowRight, GitBranch, Menu, Network, X } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { getDefaultPathForUser } from '../utils/appRoutes'
import ThemeToggle from '../components/ui/ThemeToggle'

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
]

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span className="app-logo-icon !h-9 !w-9">
        <Network size={18} className="text-white" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[14px] font-bold tracking-tight text-white-star">GNN Insight</span>
        <span className="text-[10.5px] text-twilight tracking-wide">Graph research, premium</span>
      </span>
    </Link>
  )
}

function MobileMenu({ open, onClose, user }) {
  if (!open) return null
  return (
    <div className="lg:hidden border-t border-line-subtle bg-deep/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-4 space-y-1">
        {NAV_LINKS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onClose}
            className={({ isActive }) =>
              `block public-nav-link ${isActive ? 'is-active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="pt-2 mt-2 border-t border-line-subtle flex gap-2">
          {user ? (
            <Link
              to={getDefaultPathForUser(user)}
              className="btn-galaxy flex-1"
              onClick={onClose}
            >
              Workspace
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost flex-1" onClick={onClose}>
                Sign in
              </Link>
              <Link to="/register" className="btn-galaxy flex-1" onClick={onClose}>
                Get started <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PublicLayout() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="public-shell">
      <header className={`public-navbar ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-6">
          <Brand />
          <nav className="hidden lg:flex items-center gap-1 ml-2">
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `public-nav-link ${isActive ? 'is-active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <a
              href="https://github.com/oanha3101/GNN_viz"
              target="_blank"
              rel="noreferrer"
              className="public-nav-link inline-flex items-center gap-1.5"
            >
              <GitBranch size={14} /> GitHub
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link
                to={getDefaultPathForUser(user)}
                className="btn-galaxy hidden sm:inline-flex"
              >
                Open workspace <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex btn-ghost">
                  Sign in
                </Link>
                <Link to="/register" className="btn-galaxy hidden sm:inline-flex">
                  Get started <ArrowRight size={14} />
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-default text-moonlight"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} />
      </header>

      <main className="public-section">
        <Outlet />
      </main>

      <footer className="footer mt-24">
        <div className="mx-auto max-w-7xl px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_repeat(3,_1fr)]">
          <div>
            <Brand />
            <p className="mt-4 text-sm text-twilight max-w-sm leading-relaxed">
              An internal platform for training, replaying, comparing, and governing
              Graph Neural Network experiments — built for graph researchers.
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              Product
            </div>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-starlight transition-colors">Overview</Link></li>
              <li><Link to="/about" className="hover:text-starlight transition-colors">About</Link></li>
              <li><Link to="/login" className="hover:text-starlight transition-colors">Sign in</Link></li>
              <li><Link to="/register" className="hover:text-starlight transition-colors">Get started</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              Capabilities
            </div>
            <ul className="space-y-2 text-sm">
              <li>Six GNN task workflows</li>
              <li>GraphSAGE · GCN · GAT</li>
              <li>WebSocket epoch streaming</li>
              <li>Replay &amp; compare runs</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              Connect
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://github.com/oanha3101/GNN_viz"
                  className="inline-flex items-center gap-1.5 hover:text-starlight transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitBranch size={13} /> GitHub
                </a>
              </li>
              <li>Researcher · Admin · Viewer roles</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line-subtle">
          <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-shadow">
            <span>&copy; {new Date().getFullYear()} GNN Insight. Research-grade tooling.</span>
            <span className="font-mono tracking-wide">v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
