import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Panel } from './Panel'
import { EmptyState } from './EmptyState'
import { LoadingState } from './LoadingState'
import { ErrorState } from './ErrorState'

describe('Panel primitive', () => {
  it('renders title, subtitle, actions, footer and children', () => {
    render(
      <Panel
        title="Task 1"
        subtitle="Accuracy"
        actions={<button>act</button>}
        footer={<div>ftr</div>}
      >
        <div>body</div>
      </Panel>
    )
    expect(screen.getByText('Task 1')).toBeInTheDocument()
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
    expect(screen.getByText('act')).toBeInTheDocument()
    expect(screen.getByText('ftr')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })
})

describe('EmptyState primitive', () => {
  it('renders title + description and triggers action', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        title="No data"
        description="Upload CSV to begin"
        actionLabel="Upload"
        onAction={onAction}
      />
    )
    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(screen.getByText('Upload CSV to begin')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Upload'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('LoadingState primitive', () => {
  it('renders title and progress bar when progress provided', () => {
    const { container } = render(<LoadingState title="Loading…" progress={0.5} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    const bar = container.querySelector('.bg-cyan-500')
    expect(bar).toBeTruthy()
    expect(bar.getAttribute('style')).toContain('50%')
  })

  it('clamps progress outside [0, 1] range', () => {
    const { container } = render(<LoadingState progress={2} />)
    const bar = container.querySelector('.bg-cyan-500')
    expect(bar.getAttribute('style')).toContain('100%')
  })
})

describe('ErrorState primitive', () => {
  it('shows error message and calls onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new Error('boom')} onRetry={onRetry} />)
    expect(screen.getByText('boom')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('toggles details on click', () => {
    const err = new Error('boom')
    err.stack = 'at line 1'
    render(<ErrorState error={err} />)
    expect(screen.queryByText(/at line 1/)).toBeNull()
    fireEvent.click(screen.getByText('Details'))
    expect(screen.getByText(/at line 1/)).toBeInTheDocument()
  })
})
