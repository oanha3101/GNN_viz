import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Check, Info, AlertTriangle, X } from 'lucide-react'

const ToastContext = createContext({
  showToast: () => {},
})

let toastSeq = 0

const TYPE_STYLES = {
  success: {
    icon: Check,
    bar: 'bg-aurora-green',
    border: 'border-aurora-green/30',
    bg: 'bg-aurora-green/[0.08]',
    text: 'text-aurora-green',
  },
  info: {
    icon: Info,
    bar: 'bg-amethyst',
    border: 'border-amethyst/30',
    bg: 'bg-amethyst/[0.08]',
    text: 'text-amethyst',
  },
  warning: {
    icon: AlertTriangle,
    bar: 'bg-amber-400',
    border: 'border-amber-400/30',
    bg: 'bg-amber-500/[0.08]',
    text: 'text-amber-300',
  },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message, options = {}) => {
    const id = ++toastSeq
    const type = options.type || 'success'
    const duration = options.duration ?? 2400
    setToasts((list) => [...list, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
    return id
  }, [remove])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-2 print:hidden">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info
  const Icon = style.icon

  return (
    <div
      className={`pointer-events-auto flex min-w-[240px] max-w-sm items-center gap-3 overflow-hidden rounded-xl border ${style.border} ${style.bg} pl-0 pr-3 py-2 text-sm shadow-[0_18px_42px_-18px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-200 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
      role="status"
    >
      <span className={`h-9 w-1 rounded-full ${style.bar}`} />
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.bg} ${style.text}`}>
        <Icon size={14} />
      </span>
      <span className="flex-1 text-white-star">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="text-twilight transition-colors hover:text-white-star"
        aria-label="Close"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

export default ToastContext
