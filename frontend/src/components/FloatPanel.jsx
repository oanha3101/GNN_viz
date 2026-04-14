import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

/**
 * FloatPanel — Wrapper that lets any inline panel expand into a floating overlay.
 *
 * Usage:
 *   <FloatPanel title="Biểu đồ">
 *     <MyChart />
 *   </FloatPanel>
 *
 * When NOT expanded: renders children inline with a small expand button top-right.
 * When expanded: renders children in a full-viewport overlay portal (84vw × 84vh).
 */
export default function FloatPanel({ title = '', children, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const toggle = useCallback(() => setExpanded(v => !v), [])

  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  const expandBtn = (
    <button
      onClick={toggle}
      title={expanded ? 'Thu nhỏ' : 'Mở rộng'}
      className={`
        absolute top-2 right-2 z-30
        w-6 h-6 flex items-center justify-center
        rounded-md
        border border-slate-700/60 backdrop-blur-sm
        transition-all duration-150
        ${expanded
          ? 'bg-slate-200/10 text-white hover:bg-slate-200/20'
          : 'bg-slate-900/60 text-slate-500 hover:text-slate-200 hover:bg-slate-800/80 opacity-30 hover:opacity-100'
        }
      `}
    >
      {expanded ? <X size={12} /> : <Maximize2 size={12} />}
    </button>
  )

  // Inline (collapsed) mode — no changes to layout
  if (!expanded) {
    return (
      <div className={`relative w-full h-full ${className}`}>
        {expandBtn}
        {children}
      </div>
    )
  }

  // Expanded overlay mode — rendered via portal so it escapes grid constraints
  const overlay = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(1, 8, 22, 0.82)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative rounded-[24px] border border-slate-700/60 bg-[#040e22] shadow-2xl overflow-hidden flex flex-col"
        style={{ width: '84vw', height: '84vh', maxWidth: '1400px' }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-3 shrink-0">
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-slate-400">
            {title}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-600 italic">ESC hoặc bấm để thu nhỏ</span>
            <button
              onClick={toggle}
              className="px-3 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition-all flex items-center gap-1.5"
            >
              <X size={10} /> Thu nhỏ
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Placeholder inline so grid doesn't collapse */}
      <div className={`relative w-full h-full ${className}`}>
        {expandBtn}
        <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs pointer-events-none select-none">
          <span className="italic opacity-60">Panel đang mở rộng</span>
        </div>
      </div>
      {createPortal(overlay, document.body)}
    </>
  )
}
