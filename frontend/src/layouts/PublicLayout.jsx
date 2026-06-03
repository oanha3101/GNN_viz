import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowRight, GitBranch, Menu, Network, X } from 'lucide-react'
import useAuthStore from '../store/authStore'
import { getDefaultPathForUser } from '../utils/appRoutes'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'

function Brand({ t }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span className="app-logo-icon !h-9 !w-9">
        <Network size={18} className="text-white" />
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
              className="btn-galaxy flex-1"
              onClick={onClose}
            >
              {t('public.workspace')}
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost flex-1" onClick={onClose}>
                {t('public.sign_in')}
              </Link>
              <Link to="/register" className="btn-galaxy flex-1" onClick={onClose}>
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
    <div className="public-shell">
      <header className={`public-navbar ${scrolled ? 'is-scrolled' : ''}`}>
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
                className="btn-galaxy hidden sm:inline-flex"
              >
                {t('public.open_workspace')} <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex btn-ghost">
                  {t('public.sign_in')}
                </Link>
                <Link to="/register" className="btn-galaxy hidden sm:inline-flex">
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

      <footer className="footer mt-24">
        <div className="mx-auto max-w-7xl px-6 py-12 grid gap-10 md:grid-cols-[1.4fr_repeat(3,_1fr)]">
          <div>
            <Brand t={t} />
            <p className="mt-4 text-sm text-twilight max-w-sm leading-relaxed">
              {t('public.footer_about')}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              {t('public.footer_product')}
            </div>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-starlight transition-colors">{t('public.footer_overview')}</Link></li>
              <li><Link to="/about" className="hover:text-starlight transition-colors">{t('public.nav_about')}</Link></li>
              <li><Link to="/login" className="hover:text-starlight transition-colors">{t('public.sign_in')}</Link></li>
              <li><Link to="/register" className="hover:text-starlight transition-colors">{t('public.get_started')}</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              {t('public.footer_capabilities')}
            </div>
            <ul className="space-y-2 text-sm">
              <li>{t('public.footer_capabilities_1')}</li>
              <li>{t('public.footer_capabilities_2')}</li>
              <li>{t('public.footer_capabilities_3')}</li>
              <li>{t('public.footer_capabilities_4')}</li>
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-ultra text-text-shadow mb-3">
              {t('public.footer_connect')}
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
              <li>{t('public.footer_roles')}</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line-subtle">
          <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-shadow">
            <span>{t('public.footer_copy', { year: new Date().getFullYear() })}</span>
            <span className="font-mono tracking-wide">v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
