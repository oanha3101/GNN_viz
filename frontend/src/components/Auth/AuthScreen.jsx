import { useEffect, useState } from 'react'
import { ArrowRight, LockKeyhole, Network, UserPlus } from 'lucide-react'
import useAuthStore from '../../store/authStore'

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
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative overflow-hidden border-b border-slate-800/80 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.18),_transparent_42%),linear-gradient(180deg,_rgba(8,15,31,0.98),_rgba(2,6,23,1))] px-8 py-10 lg:border-b-0 lg:border-r">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.05)_0%,transparent_40%,rgba(14,165,233,0.06)_100%)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                <Network size={13} /> GNN-Insight
              </div>
              <h1 className="mt-6 max-w-lg text-4xl font-black tracking-tight text-white lg:text-5xl">
                Dang nhap truoc, roi moi vao lab va khu quan tri dung role.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
                Luong san pham nay tach ro giua trang cong khai, khu nghien cuu, va giao dien admin.
                Ban dang khoa dung huong UX truoc khi mo rong them tinh nang.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FeatureCard title="Auth First" body="Login/Register la cong vao bat buoc truoc khi vao workspace." />
              <FeatureCard title="Research Lab" body="Researcher va viewer vao shell rieng cho du an, dataset, thuc nghiem." />
              <FeatureCard title="Admin Route" body="Admin dang nhap bang tai khoan admin va vao khu van hanh tach biet." />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-xl rounded-[32px] border border-slate-800/80 bg-slate-950/70 p-8 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  {mode === 'login' ? 'Dang nhap' : 'Tao tai khoan'}
                </div>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {mode === 'login' ? 'Vao dung shell theo role' : 'Khoi tao tai khoan cho workspace'}
                </h2>
              </div>
              <div className="flex gap-2">
                <ModeButton active={mode === 'login'} onClick={() => onModeChange?.('login')} icon={LockKeyhole} label="Login" />
                <ModeButton active={mode === 'register'} onClick={() => onModeChange?.('register')} icon={UserPlus} label="Register" />
              </div>
            </div>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              {mode === 'register' ? (
                <>
                  <Field
                    label="Email"
                    value={form.email}
                    onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                    placeholder="researcher@example.com"
                  />
                  <Field
                    label="Full name"
                    value={form.fullName}
                    onChange={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                    placeholder="Tran Thi Researcher"
                  />
                </>
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
                placeholder="••••••••"
                type="password"
              />

              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:opacity-60"
              >
                {mode === 'login' ? <LockKeyhole size={15} /> : <UserPlus size={15} />}
                {loading ? 'Dang xu ly...' : mode === 'login' ? 'Dang nhap va vao workspace' : 'Tao tai khoan'}
                <ArrowRight size={15} />
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

function FeatureCard({ title, body }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  )
}

function ModeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
          : 'border-slate-700 bg-slate-900 text-slate-400'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/30"
      />
    </label>
  )
}
