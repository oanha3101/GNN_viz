import { useEffect, useState } from 'react'
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

const PLATFORM_POINTS = [
  {
    icon: <Network size={18} />,
    title: 'Connected workspace',
    description: 'Keep projects, datasets, and experiments under one research shell.',
  },
  {
    icon: <Database size={18} />,
    title: 'Governed data flow',
    description: 'Track versions and training context without juggling multiple screens.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Admin-ready controls',
    description: 'Role-based access and audit-friendly operations are built into the platform.',
  },
]

export default function AuthScreen({ mode = 'login', onModeChange, onAuthenticated }) {
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)

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
              Research Platform
            </div>
            <div className="auth-hero-mark">
              <div className="auth-logo">
                <Network size={28} className="text-white" />
              </div>
              <div>
                <div className="auth-brand-name">GNN Insight</div>
                <div className="auth-brand-subtitle">Graph Neural Network Research Platform</div>
              </div>
            </div>
            <h1 className="auth-hero-title">
              Graph work, grounded.
            </h1>
            <p className="auth-hero-text">
              A split workspace for serious experiments: cleaner dataset governance, structured project context, and training flows that stay readable.
            </p>

            <div className="auth-visual-grid">
              {PLATFORM_POINTS.map((item) => (
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
                <span className="auth-metric-label">Project-aware runs</span>
                <strong>Tracked context</strong>
              </div>
              <div className="auth-metric-card">
                <span className="auth-metric-label">Dataset lifecycle</span>
                <strong>Versioned inputs</strong>
              </div>
              <div className="auth-metric-card">
                <span className="auth-metric-label">Session review</span>
                <strong>Replay-ready logs</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-form-pane">
          <div className="auth-form-shell">
            <div className="auth-compact-brand">
              <div className="auth-logo auth-logo-compact">
                <Network size={22} className="text-white" />
              </div>
              <div>
                <div className="auth-brand-name">GNN Insight</div>
                <div className="auth-brand-subtitle">Graph Neural Network Research Platform</div>
              </div>
            </div>

            <div className="auth-form-header">
              <div className="auth-form-eyebrow">Secure Access</div>
              <div className="auth-tabs">
                <button
                  type="button"
                  onClick={() => onModeChange?.('login')}
                  className={`auth-tab ${mode === 'login' ? 'auth-tab-active' : ''}`}
                >
                  <LockKeyhole size={14} />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange?.('register')}
                  className={`auth-tab ${mode === 'register' ? 'auth-tab-active' : ''}`}
                >
                  <UserPlus size={14} />
                  Register
                </button>
              </div>
            </div>

            <div className="auth-form-body auth-form-card">
              <h2 className="auth-form-title">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="auth-form-text">
                {mode === 'login'
                  ? 'Sign in to continue into your research workspace.'
                  : 'Open a new account to start managing graph learning workflows.'}
              </p>

              <div className="auth-social-stack">
                <QuickAuth icon={<Globe2 size={16} />} label="Continue with Google" note="Coming soon" />
                <QuickAuth icon={<GitBranch size={16} />} label="Continue with GitHub" note="Coming soon" />
              </div>

              <div className="auth-divider my-6">
                <span>or use your credentials</span>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'register' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Email"
                      value={form.email}
                      onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                      placeholder="you@example.com"
                    />
                    <Field
                      label="Full name"
                      value={form.fullName}
                      onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                      placeholder="Nguyen Van A"
                    />
                  </div>
                ) : null}

                <Field
                  label="Username"
                  value={form.username}
                  onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                  placeholder="your_username"
                />
                <Field
                  label="Password"
                  value={form.password}
                  onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                  placeholder="Enter your password"
                  type="password"
                />

                {mode === 'login' ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-twilight">Use your existing workspace account.</div>
                    <button type="button" className="auth-link-subtle">
                      <KeyRound size={14} />
                      Forgot password
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
                      Processing...
                    </span>
                  ) : (
                    <>
                      {mode === 'login' ? 'Sign In' : 'Create Account'}
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
