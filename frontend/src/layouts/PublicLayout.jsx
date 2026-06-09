import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowRight, BookOpen, GitBranch, Menu, Network, X } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { getDefaultPathForUser } from '../utils/appRoutes'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'

function Brand({ t }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span className="app-logo-icon !h-9 !w-9 !bg-deep/80 !border !border-white/10 shadow-lg flex items-center justify-center overflow-hidden">
        <Network size={22} color="#ffffff" strokeWidth={2.2} className="transform group-hover:scale-110 transition-all duration-300" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[14px] font-bold tracking-tight text-white-star">{t('brand.title')}</span>
        <span className="text-[10.5px] text-twilight tracking-wide">{t('public.brand_subtitle_short')}</span>
      </span>
    </Link>
  )
}

function MobileMenu({ open, onClose, user, t, navLinks }) {
  if (!open) return null
  return (
    <div className="lg:hidden border-t border-line-subtle bg-deep/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-4 space-y-1">
        {navLinks.map((item) => (
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
              className="landing-btn-primary flex-1 justify-center"
              onClick={onClose}
            >
              {t('public.workspace')}
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="landing-btn-ghost flex-1 justify-center" onClick={onClose}>
                {t('public.sign_in')}
              </Link>
              <Link to="/register" className="landing-btn-primary flex-1 justify-center" onClick={onClose}>
                {t('public.get_started')} <ArrowRight size={14} />
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
  const { t } = useLanguage()

  const navLinks = [
    { to: '/', label: t('public.nav_home'), end: true },
    { to: '/about', label: t('public.nav_about') },
  ]

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
    <div className="landing-shell">
      <header className={`landing-navbar ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center gap-6">
          <Brand t={t} />
          <nav className="hidden lg:flex items-center gap-1 ml-2">
            {navLinks.map((item) => (
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
            <LanguageSwitcher variant="compact" />
            <ThemeToggle />
            {user ? (
              <Link
                to={getDefaultPathForUser(user)}
                className="landing-btn-primary hidden sm:inline-flex"
              >
                {t('public.open_workspace')} <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex landing-btn-ghost">
                  {t('public.sign_in')}
                </Link>
                <Link to="/register" className="landing-btn-primary hidden sm:inline-flex">
                  {t('public.get_started')} <ArrowRight size={14} />
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-default text-moonlight"
              aria-label={t('public.toggle_menu')}
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
        <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} t={t} navLinks={navLinks} />
      </header>

      <main className="public-section">
        <Outlet />
      </main>

      <footer className="landing-footer mt-24">
        <div className="mx-auto max-w-7xl px-6 py-12 grid gap-10 md:grid-cols-4">
          <div>
            <Brand t={t} />
            <p className="mt-4 text-sm text-twilight max-w-sm leading-relaxed">
              {t('public.footer_about')}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              Research
            </div>
            <ul className="space-y-2 text-sm">
              <li><Link to="/about" className="hover:text-starlight transition-colors">Tasks</Link></li>
              <li><Link to="/about" className="hover:text-starlight transition-colors">Models</Link></li>
              <li><Link to="/about" className="hover:text-starlight transition-colors">Explainability</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              Resources
            </div>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://github.com/oanha3101/GNN_viz" className="inline-flex items-center gap-1.5 hover:text-starlight transition-colors" target="_blank" rel="noreferrer">
                  <BookOpen size={13} /> Documentation
                </a>
              </li>
              <li>
                <a href="https://github.com/oanha3101/GNN_viz" className="inline-flex items-center gap-1.5 hover:text-starlight transition-colors" target="_blank" rel="noreferrer">
                  <GitBranch size={13} /> GitHub
                </a>
              </li>
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
              <li>
                <span className="inline-flex items-center gap-1.5 text-twilight">
                  gnn-insight@research.dev
                </span>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line-subtle">
          <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-shadow">
            <span>© {new Date().getFullYear()} GNN-Insight</span>
            <span className="font-mono tracking-wide">v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
