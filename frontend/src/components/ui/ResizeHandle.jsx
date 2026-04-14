import { Separator } from 'react-resizable-panels'

/**
 * Styled resize handle for react-resizable-panels.
 * direction: 'horizontal' | 'vertical'
 */
export default function ResizeHandle({ direction = 'horizontal', className = '' }) {
  return (
    <Separator
      className={`resize-handle resize-handle-${direction} ${className}`}
    />
  )
}
