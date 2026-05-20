import {
  AtSign,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Calendar,
  Camera,
  Check,
  ExternalLink,
  GitBranch,
  Globe2,
  IdCard,
  Link as LinkIcon,
  MapPin,
  Save,
  Sparkles,
  Upload,
  User,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import LoadingState from '../../components/primitives/LoadingState'
import useAuthStore from '../../store/authStore'

const EMPTY_FORM = {
  email: '',
  username: '',
  full_name: '',
  bio: '',
  github_url: '',
  organization: '',
  job_title: '',
  location: '',
  profile_image: '',
}

const initialsFor = (form) => {
  const source = (form.full_name || form.username || 'U').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

const fmtDate = (value) => {
  if (!value) return '\u2014'
  try {
    return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '\u2014'
  }
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const loading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)

  const [form, setForm] = useState(EMPTY_FORM)
  const [savedMessage, setSavedMessage] = useState('')
  const [localError, setLocalError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    setForm({
      email: user.email || '',
      username: user.username || '',
      full_name: user.full_name || '',
      bio: user.bio || '',
      github_url: user.github_url || '',
      organization: user.organization || '',
      job_title: user.job_title || '',
      location: user.location || '',
      profile_image: user.profile_image || '',
    })
  }, [user])

  const baseline = useMemo(
    () => ({
      email: user?.email || '',
      username: user?.username || '',
      full_name: user?.full_name || '',
      bio: user?.bio || '',
      github_url: user?.github_url || '',
      organization: user?.organization || '',
      job_title: user?.job_title || '',
      location: user?.location || '',
      profile_image: user?.profile_image || '',
    }),
    [user],
  )

  const isDirty = useMemo(
    () => Object.keys(EMPTY_FORM).some((key) => (form[key] || '') !== (baseline[key] || '')),
    [form, baseline],
  )

  if (!user) {
    return <LoadingState title="Loading profile..." className="min-h-[480px]" />
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()
    setSavedMessage('')
    setLocalError('')
    try {
      await updateProfile(form)
      setSavedMessage('Profile updated.')
    } catch (err) {
      setLocalError(err.message)
    }
  }

  const handleReset = () => {
    setForm(baseline)
    setLocalError('')
    setSavedMessage('')
  }

  const handleAvatarPick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLocalError('Please choose an image file for the avatar.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalError('Avatar image should be smaller than 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setLocalError('')
      setForm((prev) => ({ ...prev, profile_image: String(reader.result || '') }))
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const displayName = form.full_name || form.username || 'Unnamed'
  const initials = initialsFor(form)
  const githubHandle = (form.github_url || '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '')

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      {/* Hero strip ------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl border border-line-subtle/50 bg-gradient-to-br from-rose-500/12 via-amber-500/8 to-cyan-500/10 px-5 py-5 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-16 h-44 w-44 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleAvatarPick}
              className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line-subtle/60 bg-deep/60 shadow-[0_18px_36px_-18px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.02]"
              title="Change avatar"
            >
              {form.profile_image ? (
                <img src={form.profile_image} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="bg-gradient-to-br from-rose-500 to-amber-500 bg-clip-text text-3xl font-black text-transparent">
                  {initials}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Camera size={11} /> Change
              </span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold text-white-star">{displayName}</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  <BadgeCheck size={11} /> {user.role || 'member'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-shadow">
                <AtSign size={12} className="text-twilight" />
                <span className="truncate">{form.username || '—'}</span>
                <span className="text-twilight/60">·</span>
                <span className="truncate">{form.email || '—'}</span>
              </div>
              {form.bio ? (
                <p className="mt-2 max-w-xl truncate text-xs leading-5 text-text-shadow">{form.bio}</p>
              ) : (
                <p className="mt-2 max-w-xl text-xs italic leading-5 text-text-shadow/70">
                  Add a short bio so collaborators know what you research.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <HeroPill icon={Calendar} label="Joined" value={fmtDate(user.created_at)} />
            <HeroPill icon={MapPin} label="Location" value={form.location || 'Not set'} />
            <HeroPill icon={Building2} label="Org" value={form.organization || 'Not set'} />
          </div>
        </div>
      </section>

      {/* Body grid -------------------------------------------------------- */}
      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        {/* Snapshot ------------------------------------------------------- */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-line-subtle/50 bg-deep/50 p-4">
            <header className="flex items-center justify-between border-b border-line-subtle/40 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amethyst" />
                <h2 className="text-sm font-bold text-white-star">Account snapshot</h2>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-twilight">read-only</span>
            </header>
            <dl className="mt-3 space-y-2.5 text-xs">
              <SnapshotRow icon={IdCard} label="User ID" value={`#${user.id ?? '-'}`} mono />
              <SnapshotRow icon={UserRound} label="Username" value={form.username || '\u2014'} mono />
              <SnapshotRow icon={AtSign} label="Email" value={form.email || '\u2014'} />
              <SnapshotRow icon={BadgeCheck} label="Role" value={user.role || 'member'} />
              <SnapshotRow icon={Calendar} label="Joined" value={fmtDate(user.created_at)} />
              <SnapshotRow icon={Calendar} label="Updated" value={fmtDate(user.updated_at)} />
            </dl>
          </section>

          {/* Avatar preview block */}
          <section className="rounded-2xl border border-line-subtle/50 bg-deep/50 p-4">
            <header className="flex items-center justify-between border-b border-line-subtle/40 pb-3">
              <div className="flex items-center gap-2">
                <Camera size={14} className="text-amethyst" />
                <h2 className="text-sm font-bold text-white-star">Avatar</h2>
              </div>
              {form.profile_image ? (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, profile_image: '' }))}
                  className="inline-flex items-center gap-1 rounded-md border border-line-subtle/45 bg-deep/40 px-2 py-1 text-[10px] font-semibold text-text-shadow hover:text-aurora-rose"
                >
                  <X size={11} /> Remove
                </button>
              ) : null}
            </header>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line-subtle/55 bg-deep/55">
                {form.profile_image ? (
                  <img src={form.profile_image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-twilight">{initials}</span>
                )}
              </div>
              <div className="min-w-0 text-xs text-text-shadow">
                <p className="font-semibold text-white-star">Drop a PNG or JPG</p>
                <p>Max 2 MB. Or paste a URL below.</p>
                <button
                  type="button"
                  onClick={handleAvatarPick}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amethyst hover:underline"
                >
                  <Upload size={11} />
                  Choose file
                </button>
              </div>
            </div>
          </section>

          {/* Online presence preview */}
          {(form.github_url || form.organization || form.location) ? (
            <section className="rounded-2xl border border-line-subtle/50 bg-deep/50 p-4">
              <header className="flex items-center gap-2 border-b border-line-subtle/40 pb-3">
                <Globe2 size={14} className="text-amethyst" />
                <h2 className="text-sm font-bold text-white-star">Public links</h2>
              </header>
              <ul className="mt-3 space-y-2 text-xs">
                {form.github_url ? (
                  <li>
                    <a
                      href={form.github_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-amethyst hover:underline"
                    >
                      <GitBranch size={12} />
                      <span className="truncate">{githubHandle || form.github_url}</span>
                      <ExternalLink size={10} className="opacity-60" />
                    </a>
                  </li>
                ) : null}
                {form.organization ? (
                  <li className="flex items-center gap-2 text-text-shadow">
                    <Building2 size={12} />
                    <span className="truncate">{form.organization}</span>
                  </li>
                ) : null}
                {form.location ? (
                  <li className="flex items-center gap-2 text-text-shadow">
                    <MapPin size={12} />
                    <span className="truncate">{form.location}</span>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </aside>

        {/* Edit form ------------------------------------------------------ */}
        <div className="space-y-4">
          <FormSection
            icon={User}
            title="Identity"
            subtitle="The name and handle collaborators will see across the workspace."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Full name"
                value={form.full_name}
                onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))}
                icon={<UserRound size={13} />}
              />
              <Field
                label="Username"
                value={form.username}
                onChange={(value) => setForm((prev) => ({ ...prev, username: value }))}
                icon={<AtSign size={13} />}
              />
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                icon={<AtSign size={13} />}
                colSpan="md:col-span-2"
              />
            </div>
            <FieldTextArea
              label="Bio"
              value={form.bio}
              onChange={(value) => setForm((prev) => ({ ...prev, bio: value }))}
              rows={3}
              placeholder="A short note about your research focus."
            />
          </FormSection>

          <FormSection
            icon={BriefcaseBusiness}
            title="Workplace"
            subtitle="Helps reviewers and admins understand your context."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Organization"
                value={form.organization}
                onChange={(value) => setForm((prev) => ({ ...prev, organization: value }))}
                icon={<Building2 size={13} />}
              />
              <Field
                label="Job title"
                value={form.job_title}
                onChange={(value) => setForm((prev) => ({ ...prev, job_title: value }))}
                icon={<BriefcaseBusiness size={13} />}
              />
              <Field
                label="Location"
                value={form.location}
                onChange={(value) => setForm((prev) => ({ ...prev, location: value }))}
                icon={<MapPin size={13} />}
                colSpan="md:col-span-2"
              />
            </div>
          </FormSection>

          <FormSection
            icon={LinkIcon}
            title="Online presence"
            subtitle="Optional links surfaced on your public profile."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="GitHub URL"
                value={form.github_url}
                onChange={(value) => setForm((prev) => ({ ...prev, github_url: value }))}
                icon={<GitBranch size={13} />}
                placeholder="https://github.com/handle"
              />
              <Field
                label="Avatar URL"
                value={form.profile_image}
                onChange={(value) => setForm((prev) => ({ ...prev, profile_image: value }))}
                icon={<Camera size={13} />}
                placeholder="Optional image URL"
              />
            </div>
          </FormSection>

          {/* Messages */}
          {localError || authError ? (
            <div className="rounded-lg border border-aurora-rose/25 bg-aurora-rose/[0.08] px-3 py-2 text-sm text-aurora-rose">
              {localError || authError}
            </div>
          ) : null}
          {savedMessage && !isDirty ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-aurora-green/25 bg-aurora-green/[0.08] px-3 py-2 text-sm text-aurora-green">
              <Check size={14} />
              {savedMessage}
            </div>
          ) : null}
        </div>
      </div>

      {/* Sticky save bar -------------------------------------------------- */}
      <div
        className={`pointer-events-none sticky bottom-3 z-30 flex justify-end transition-opacity ${isDirty ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line-subtle/55 bg-deep/85 px-3 py-2 shadow-[0_18px_42px_-18px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <span className="text-xs font-semibold text-text-shadow">Unsaved changes</span>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-lg border border-line-subtle/45 bg-deep/55 px-3 py-1.5 text-xs font-semibold text-text-shadow hover:text-white-star"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-galaxy inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={13} />
            {loading ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </form>
  )
}

function HeroPill({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line-subtle/55 bg-deep/55 px-3 py-1.5 text-[11px]">
      <Icon size={12} className="text-amethyst" />
      <span className="font-semibold uppercase tracking-wider text-twilight">{label}</span>
      <span className="font-semibold text-white-star">{value}</span>
    </div>
  )
}

function SnapshotRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-text-shadow">
        <Icon size={12} className="text-twilight" />
        <span>{label}</span>
      </dt>
      <dd className={`truncate font-semibold text-white-star ${mono ? 'font-mono text-[11px]' : ''}`} title={String(value)}>
        {value}
      </dd>
    </div>
  )
}

function FormSection({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-line-subtle/50 bg-deep/50 p-4">
      <header className="mb-4 flex items-start gap-3 border-b border-line-subtle/40 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-subtle/55 bg-deep/65 text-amethyst">
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white-star">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-text-shadow">{subtitle}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, type = 'text', icon = null, placeholder = '', colSpan = '' }) {
  return (
    <label className={`block ${colSpan}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">
        {icon}
        <span>{label}</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-cosmic w-full"
        placeholder={placeholder}
      />
    </label>
  )
}

function FieldTextArea({ label, value, onChange, rows = 4, placeholder = '' }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-shadow">{label}</div>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-cosmic w-full resize-none"
        placeholder={placeholder}
      />
    </label>
  )
}
