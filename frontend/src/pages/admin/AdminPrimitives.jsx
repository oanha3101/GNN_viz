import { useEffect } from 'react'
import { X } from 'lucide-react'

export function FormField({ icon: Icon, label, required, colSpan = '', children }) {
  return (
    <label className={`block ${colSpan}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
        {Icon ? <Icon size={11} /> : null}
        <span>{label}{required ? <span className="text-aurora-rose"> *</span> : null}</span>
      </div>
      {children}
    </label>
  )
}

export function SlideOver({ open, title, subtitle, icon: Icon, onClose, footer, children }) {
  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="admin-slideover-root">
      <button type="button" aria-label="Close" onClick={onClose} className="admin-slideover-backdrop" />
      <aside className="admin-slideover-panel">
        <header className="admin-slideover-header">
          <div className="flex items-center gap-3">
            {Icon ? (
              <div className="admin-slideover-icon">
                <Icon size={16} />
              </div>
            ) : null}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
              {subtitle ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="admin-icon-btn" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="admin-slideover-body">{children}</div>
        {footer ? <footer className="admin-slideover-footer">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export function ChipGroup({ value, options, onChange }) {
  return (
    <div className="admin-chip-group">
      {options.map((opt) => (
        <button
          key={opt.value || 'all'}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`admin-chip ${value === opt.value ? 'admin-chip-active' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function AdminPagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 12)))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(page * pageSize, total)
  return (
    <div className="admin-pagination">
      <div>
        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{from}–{to}</span> of <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="admin-page-btn"
        >
          Prev
        </button>
        <span className="admin-page-indicator">Page {page} / {totalPages}</span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="admin-page-btn"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function relativeDate(value) {
  if (!value) return '—'
  try {
    const d = new Date(value)
    const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function StatusPill({ active, activeLabel = 'Active', inactiveLabel = 'Disabled' }) {
  return (
    <span className={`admin-status-dot ${active ? 'admin-status-active' : 'admin-status-disabled'}`}>
      <span className="admin-status-led" />
      {active ? activeLabel : inactiveLabel}
    </span>
  )
}

export const PAGE_SIZE_OPTIONS = [8, 12, 24, 48]
