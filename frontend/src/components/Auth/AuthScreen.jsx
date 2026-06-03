import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Database,
  GitBranch,
  Globe2,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import { useLanguage } from '../../contexts/LanguageContext'
import LanguageSwitcher from '../ui/LanguageSwitcher'

export default function AuthScreen({ mode = 'login', onModeChange, onAuthenticated }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const { t } = useLanguage()

  const platformPoints = useMemo(
    () => [
      {
        icon: <Network size={18} />,
        title: t('auth.feature_connected_title'),
        description: t('auth.feature_connected_desc'),
      },
      {
        icon: <Database size={18} />,
        title: t('auth.feature_governed_title'),
        description: t('auth.feature_governed_desc'),
      },
      {
        icon: <ShieldCheck size={18} />,
        title: t('auth.feature_admin_title'),
        description: t('auth.feature_admin_desc'),
      },
    ],
    [t],
  )

  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    fullName: '',
  })

  useEffect(() => {
    setForm({ email: '', username: '', password: '', fullName: '' })
  }, [mode])

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      const payload = mode === 'register'
        ? await register(form.email, form.username, form.password, form.fullName)
        : await login(form.username, form.password)
      onAuthenticated?.(payload?.user || null)
    } catch {
      // auth store already exposes the error
    }
  }

  return (
    <div className="auth-page auth-page-split min-h-screen bg-void text-starlight">
      <div className="auth-split-shell">
        <section className="auth-visual-pane">
          <div className="auth-visual-overlay" />
          <div className="auth-visual-copy">
            <div className="auth-badge">
              <Sparkles size={14} />
              {t('auth.platform_badge')}
            </div>
            <div className="auth-hero-mark">
              <div className="auth-logo">
                <Network size={28} className="text-white" />
              </div>
              <div>
                <div className="auth-brand-name">{t('brand.title')}</div>
                <div className="auth-brand-subtitle">{t('auth.brand_subtitle')}</div>
              </div>
            </div>
            <h1 className="auth-hero-title">
              {t('auth.hero_title')}
            </h1>
            <p className="auth-hero-text">
              {t('auth.hero_text')}
            </p>

            <div className="auth-visual-grid">
              {platformPoints.map((item) => (
                <div key={item.title} className="auth-visual-card">
                  <div className="auth-visual-icon">{item.icon}</div>
                  <div>
                    <div className="auth-visual-card-title">{item.title}</div>
                    <div className="auth-visual-card-text">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="auth-visual-metrics">
              <div className="auth-metric-card">
                <span className="auth-metric-label">{t('auth.metric_runs_label')}</span>
                <strong>{t('auth.metric_runs_value')}</strong>
              </div>
              <div className="auth-metric-card">
                <span className="auth-metric-label">{t('auth.metric_dataset_label')}</span>
                <strong>{t('auth.metric_dataset_value')}</strong>
              </div>
              <div className="auth-metric-card">
                <span className="auth-metric-label">{t('auth.metric_session_label')}</span>
                <strong>{t('auth.metric_session_value')}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-form-pane">
          <div className="auth-form-shell">
            <div className="flex items-start justify-between gap-3">
              <div className="auth-compact-brand">
                <div className="auth-logo auth-logo-compact">
                  <Network size={22} className="text-white" />
                </div>
                <div>
                  <div className="auth-brand-name">{t('brand.title')}</div>
                  <div className="auth-brand-subtitle">{t('auth.brand_subtitle')}</div>
                </div>
              </div>
              <LanguageSwitcher variant="compact" />
            </div>

            <div className="auth-form-header">
              <div className="auth-form-eyebrow">{t('auth.secure_access')}</div>
              <div className="auth-tabs">
                <button
                  type="button"
                  onClick={() => onModeChange?.('login')}
                  className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
                >
                  <LockKeyhole size={14} />
                  {t('auth.sign_in')}
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.('register')}
                  className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`}
                >
                  <UserPlus size={14} />
                  {t('auth.register_tab')}
                </button>
              </div>
            </div>

            <div className="auth-form-body auth-form-card">
              <h2 className="auth-form-title">
                {mode === 'login' ? t('auth.welcome_back_title') : t('auth.create_account_title')}
              </h2>
              <p className="auth-form-text">
                {mode === 'login' ? t('auth.login_subtitle') : t('auth.register_subtitle')}
              </p>

              <div className="auth-social-stack">
                <QuickAuth icon={<Globe2 size={16} />} label={t('auth.continue_with_google')} note={t('auth.coming_soon')} />
                <QuickAuth icon={<GitBranch size={16} />} label={t('auth.continue_with_github')} note={t('auth.coming_soon')} />
              </div>

              <div className="auth-divider my-6">
                <span>{t('auth.or_credentials')}</span>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'register' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t('auth.email')}
                      value={form.email}
                      onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                      placeholder={t('auth.email_placeholder')}
                    />
                    <Field
                      label={t('auth.full_name')}
                      value={form.fullName}
                      onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                      placeholder={t('auth.fullname_placeholder')}
                    />
                  </div>
                ) : null}

                <Field
                  label={t('auth.username')}
                  value={form.username}
                  onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                  placeholder={t('auth.username_placeholder')}
                />
                <Field
                  label={t('auth.password')}
                  value={form.password}
                  onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                  placeholder={t('auth.password_placeholder')}
                  type="password"
                />

                {mode === 'login' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-twilight">{t('auth.use_existing')}</div>
                    <button type="button" className="auth-link-subtle">
                      <KeyRound size={14} />
                      {t('auth.forgot_password_link')}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <div className="auth-error">
                    <span className="auth-error-dot" />
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit w-full"
                >
                  {loading ? (
                    <span className="auth-submit-loading">
                      <span className="auth-spinner" />
                      {t('auth.processing')}
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? t('auth.sign_in_button') : t('auth.create_account_button')}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="auth-field block">
      <div className="auth-field-label">{label}</div>
      <div className="auth-field-wrapper">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="auth-input"
        />
        <div className="auth-field-glow" />
      </div>
    </label>
  )
}

function QuickAuth({ icon, label, note }) {
  return (
    <button type="button" className="auth-social-btn">
      <span className="auth-social-icon">{icon}</span>
      <span className="auth-social-label">{label}</span>
      <span className="auth-social-note">{note}</span>
    </button>
  )
}
