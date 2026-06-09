import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import viDict from '../i18n/vi.json'
import enDict from '../i18n/en.json'

const LANG_STORAGE_KEY = 'gnn_lang'
const SUPPORTED = ['vi', 'en']
const DEFAULT_LANG = 'vi'

const DICTS = { vi: viDict, en: enDict }

function getInitialLang() {
  if (typeof window === 'undefined') return DEFAULT_LANG
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY)
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const code = navigator.language.toLowerCase()
    if (code.startsWith('vi')) return 'vi'
    if (code.startsWith('en')) return 'en'
  }
  return DEFAULT_LANG
}

function resolvePath(dict, keyPath) {
  if (!dict || !keyPath) return undefined
  const parts = keyPath.split('.')
  let cursor = dict
  for (const part of parts) {
    if (cursor && typeof cursor === 'object' && part in cursor) {
      cursor = cursor[part]
    } else {
      return undefined
    }
  }
  return cursor
}

function interpolate(template, vars) {
  if (typeof template !== 'string' || !vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name])
    }
    return match
  })
}

// Default `t` used when a component renders outside <LanguageProvider> (eg. in tests).
// Resolves keys against the default-language dictionary so labels are still meaningful.
function defaultT(key, vars) {
  const value = resolvePath(DICTS[DEFAULT_LANG], key)
  if (typeof value === 'string') {
    return interpolate(value, vars)
  }
  return key
}

const LanguageContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  toggleLang: () => {},
  t: defaultT,
  available: SUPPORTED,
})

export function LanguageProvider({ children, defaultLang }) {
  const [lang, setLangState] = useState(() => defaultLang || getInitialLang())

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang)
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', lang)
    }
  }, [lang])

  const setLang = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return
    setLangState(next)
  }, [])

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'vi' ? 'en' : 'vi'))
  }, [])

  const t = useCallback(
    (key, vars) => {
      const dict = DICTS[lang] || DICTS[DEFAULT_LANG]
      const value = resolvePath(dict, key)
      if (typeof value === 'string') {
        return interpolate(value, vars)
      }
      if (lang !== DEFAULT_LANG) {
        const fallback = resolvePath(DICTS[DEFAULT_LANG], key)
        if (typeof fallback === 'string') {
          return interpolate(fallback, vars)
        }
      }
      if (typeof console !== 'undefined' && import.meta && import.meta.env && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] Missing translation key: ${key}`)
      }
      return key
    },
    [lang],
  )

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, available: SUPPORTED }),
    [lang, setLang, toggleLang, t],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  return { t: ctx.t, lang: ctx.lang, setLang: ctx.setLang, toggleLang: ctx.toggleLang }
}

export default LanguageContext
