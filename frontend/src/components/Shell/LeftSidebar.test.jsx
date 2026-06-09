import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LeftSidebar from './LeftSidebar'

const storeState = {
  selectedTask: 1,
  setTask: vi.fn(),
  selectedModel: 'GCN',
  setModel: vi.fn(),
  isTraining: false,
  selectedNodeId: null,
}

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}))

vi.mock('../../store/useGNNStore', () => ({
  default: (selector) => selector(storeState),
}))

describe('LeftSidebar', () => {
  beforeEach(() => {
    storeState.selectedTask = 1
    storeState.selectedModel = 'GCN'
    storeState.isTraining = false
    storeState.selectedNodeId = null
    storeState.setTask.mockClear()
    storeState.setModel.mockClear()
  })

  it('renders selected task with full theme active fill and white text/icon', () => {
    const { container } = render(
      <LeftSidebar
        collapsed={false}
        onToggle={vi.fn()}
        rightPanelOpen
        setRightPanelOpen={vi.fn()}
        activeRightTab="embedding"
        setActiveRightTab={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenDataInput={vi.fn()}
        onOpenConfig={vi.fn()}
        onOpenAdmin={vi.fn()}
        onOpenWorkspace={vi.fn()}
      />,
    )

    const taskButton = screen.getByRole('button', { name: /phân loại nút/i })
    expect(taskButton.className).toContain('lab-sidebar-active')
    expect(container.querySelector('.lab-sidebar-active-fill')).toBeTruthy()
    expect(taskButton.querySelector('svg')?.getAttribute('class') || '').toContain('lab-sidebar-active-fg')
    expect(screen.getByText('Phân loại nút').className).toContain('lab-sidebar-active-fg')
  })

  it('uses a dedicated bright fill for the selected model pill', () => {
    const { container } = render(
      <LeftSidebar
        collapsed={false}
        onToggle={vi.fn()}
        rightPanelOpen
        setRightPanelOpen={vi.fn()}
        activeRightTab="embedding"
        setActiveRightTab={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenDataInput={vi.fn()}
        onOpenConfig={vi.fn()}
        onOpenAdmin={vi.fn()}
        onOpenWorkspace={vi.fn()}
      />,
    )

    expect(screen.getByText('GCN').className).toContain('lab-sidebar-active-fg')
    expect(container.querySelector('.lab-model-fill-gcn')).toBeTruthy()
    expect(container.querySelector('.lab-model-fill-gat')).toBeFalsy()
    expect(container.querySelector('.lab-model-fill-sage')).toBeFalsy()
  })

  it('calls setModel when choosing another model', () => {
    render(
      <LeftSidebar
        collapsed={false}
        onToggle={vi.fn()}
        rightPanelOpen
        setRightPanelOpen={vi.fn()}
        activeRightTab="embedding"
        setActiveRightTab={vi.fn()}
        onOpenLibrary={vi.fn()}
        onOpenDataInput={vi.fn()}
        onOpenConfig={vi.fn()}
        onOpenAdmin={vi.fn()}
        onOpenWorkspace={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'GAT' }))
    expect(storeState.setModel).toHaveBeenCalledWith('GAT')
  })
})
