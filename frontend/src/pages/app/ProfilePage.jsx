import { Camera, GitBranch, MapPin, Save, UserRound, Building2, BriefcaseBusiness, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import LoadingState from '../../components/primitives/LoadingState'
import useAuthStore from '../../store/authStore'
import { SectionCard } from '../shared/PageBlocks'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const loading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)

  const [form, setForm] = useState({
    email: '',
    username: '',
    full_name: '',
    bio: '',
    github_url: '',
    organization: '',
    job_title: '',
    location: '',
    profile_image: '',
  })
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

  if (!user) {
    return <LoadingState title="Loading profile..." className="min-h-[480px]" />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSavedMessage('')
    setLocalError('')
    try {
      await updateProfile(form)
      setSavedMessage('Profile updated.')
    } catch (err) {
      setLocalError(err.message)
    }
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

  return (
    <div className="space-y-6">
      <SectionCard
        title="My Profile"
        subtitle="Keep your identity, research focus, and public links up to date."
      >
        <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
          <div className="workspace-record-card workspace-profile-hero">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="flex flex-col items-center text-center">
              <button
                type="button"
                onClick={handleAvatarPick}
                className="workspace-avatar-stage"
                title="Change avatar"
              >
                {form.profile_image ? (
                  <img src={form.profile_image} alt={form.username} className="h-full w-full rounded-[30px] object-cover" />
                ) : (
                  <span className="workspace-avatar-letter">
                    {(form.full_name || form.username || 'U')[0].toUpperCase()}
                  </span>
                )}
                <span className="workspace-avatar-edit">
                  <Camera size={16} />
                </span>
              </button>
              <div className="mt-5 text-xl font-semibold text-white-star">{form.full_name || form.username}</div>
              <div className="mt-1 text-sm text-twilight">{user.role}</div>
              <div className="mt-3 max-w-[220px] text-xs leading-5 text-text-shadow">
                Tap the avatar to upload from your computer or media library.
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={handleAvatarPick} className="btn-nebula inline-flex items-center gap-2 text-xs">
                  <Upload size={13} />
                  Upload avatar
                </button>
                {form.profile_image ? (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, profile_image: '' }))}
                    className="btn-ghost inline-flex items-center gap-2 text-xs"
                  >
                    <X size={13} />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <div className="workspace-project-meta mt-5">
              <div className="workspace-info-item">
                <span className="workspace-info-label">Joined</span>
                <strong>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'n/a'}</strong>
              </div>
              <div className="workspace-info-item">
                <span className="workspace-info-label">Email</span>
                <strong>{user.email}</strong>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="workspace-edit-card space-y-4">
            <div className="workspace-edit-banner">
              <UserRound size={13} />
              Edit profile
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" value={form.full_name} onChange={(value) => setForm((prev) => ({ ...prev, full_name: value }))} />
              <Field label="Username" value={form.username} onChange={(value) => setForm((prev) => ({ ...prev, username: value }))} />
              <Field label="Email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} type="email" />
              <Field label="Avatar URL" value={form.profile_image} onChange={(value) => setForm((prev) => ({ ...prev, profile_image: value }))} icon={<Camera size={14} />} placeholder="Optional image URL" />
              <Field label="GitHub URL" value={form.github_url} onChange={(value) => setForm((prev) => ({ ...prev, github_url: value }))} icon={<GitBranch size={14} />} />
              <Field label="Location" value={form.location} onChange={(value) => setForm((prev) => ({ ...prev, location: value }))} icon={<MapPin size={14} />} />
              <Field label="Organization" value={form.organization} onChange={(value) => setForm((prev) => ({ ...prev, organization: value }))} icon={<Building2 size={14} />} />
              <Field label="Job title" value={form.job_title} onChange={(value) => setForm((prev) => ({ ...prev, job_title: value }))} icon={<BriefcaseBusiness size={14} />} />
            </div>

            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-shadow">Bio</div>
              <textarea
                rows={4}
                value={form.bio}
                onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                className="input-cosmic w-full resize-none"
                placeholder="A short note about your research focus."
              />
            </label>

            {localError || authError ? (
              <div className="rounded-lg border border-aurora-rose/20 bg-aurora-rose/[0.08] px-3 py-2 text-sm text-aurora-rose">
                {localError || authError}
              </div>
            ) : null}
            {savedMessage ? (
              <div className="rounded-lg border border-aurora-green/20 bg-aurora-green/[0.08] px-3 py-2 text-sm text-aurora-green">
                {savedMessage}
              </div>
            ) : null}

            <div className="workspace-inline-actions">
              <button
                type="submit"
                disabled={loading}
                className="btn-galaxy inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={14} />
                {loading ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </form>
        </div>
      </SectionCard>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', icon = null, placeholder = '' }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-shadow">
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
