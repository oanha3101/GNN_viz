import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Network } from 'lucide-react'
import SidebarButton from './SidebarButton'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}))

describe('SidebarButton', () => {
  it('renders selected state with full theme fill and white icon/text', () => {
    const { container } = render(
      <SidebarButton
        icon={Network}
        label="Cấu trúc"
        active
        collapsed={false}
        onClick={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: /cấu trúc/i })
    expect(button.className).toContain('lab-sidebar-active')
    expect(container.querySelector('.lab-sidebar-active-fill')).toBeTruthy()
    expect(button.querySelector('svg')?.getAttribute('class') || '').toContain('lab-sidebar-active-fg')
    expect(screen.getByText('Cấu trúc').className).toContain('lab-sidebar-active-fg')
  })
})
