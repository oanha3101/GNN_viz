import { useLanguage } from '../../contexts/LanguageContext'
import { useToast } from './ToastProvider'

const OPTIONS = [
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', short: 'VI' },
  { code: 'en', label: 'English', flag: '🇬🇧', short: 'EN' },
]

export default function LanguageSwitcher({ variant = 'segmented', size = 'md', className = '' }) {
  const { lang, setLang, t } = useLanguage()
  const toast = useToast()

  const handleSelect = (code) => {
    if (code === lang) return
    setLang(code)
    const msg = code === 'vi' ? t('toast.switched_vi') : t('toast.switched_en')
    toast?.showToast(msg, { type: 'success' })
  }

  if (variant === 'compact') {
    const current = OPTIONS.find((o) => o.code === lang) || OPTIONS[0]
    const next = OPTIONS.find((o) => o.code !== lang) || OPTIONS[1]
    return (
      <button
        type="button"
        onClick={() => handleSelect(next.code)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-line-subtle/55 bg-deep/50 px-2.5 py-1.5 text-xs font-semibold text-text-shadow transition-colors hover:border-line-active hover:text-white-star ${className}`}
        aria-label={t('common.language')}
        title={`${t('common.language')}: ${current.label}`}
      >
        <span aria-hidden>{current.flag}</span>
        <span>{current.short}</span>
      </button>
    )
  }

  const padding = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'

  return (
    <div
      role="radiogroup"
      aria-label={t('common.language')}
      className={`inline-flex items-center gap-1 rounded-xl border border-line-subtle/55 bg-deep/50 p-1 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const active = opt.code === lang
        return (
          <button
            key={opt.code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handleSelect(opt.code)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all ${padding} ${
              active
                ? 'bg-gradient-to-br from-amethyst/35 to-rose-500/20 text-white-star shadow-[0_6px_18px_-10px_rgba(168,85,247,0.6)]'
                : 'text-text-shadow hover:text-white-star'
            }`}
          >
            <span aria-hidden className="text-sm leading-none">{opt.flag}</span>
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
