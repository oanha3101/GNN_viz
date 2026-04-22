import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BaseForceGraph from './BaseForceGraph'

// Mock ForceGraph2D vì nó phụ thuộc vào Canvas/WebGL mà JSDOM không hỗ trợ đầy đủ
vi.mock('react-force-graph-2d', () => ({
  default: vi.fn(({ graphData }) => (
    <div data-testid="force-graph-mock">
      {graphData.nodes.length} nodes and {graphData.links.length} links
    </div>
  ))
}))

describe('BaseForceGraph Component', () => {
  const mockData = {
    nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
    links: [{ source: 0, target: 1 }, { source: 1, target: 2 }]
  }

  it('renders correctly with given graph data', async () => {
    render(<BaseForceGraph data={mockData} />)
    
    // Kiểm tra xem mock component có hiển thị đúng số lượng node/link không
    const graphElement = screen.getByTestId('force-graph-mock')
    expect(graphElement).toBeInTheDocument()
    expect(graphElement).toHaveTextContent('3 nodes and 2 links')
  })

  it('shows pulse animation/loading when data is null', () => {
    const { container } = render(<BaseForceGraph data={null} />)
    expect(container.firstChild).toHaveClass('animate-pulse')
  })
})
