import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/plotlyReact', () => ({
  default: ({ data, layout, config }) => (
    <div data-testid="lazy-plot-mock">
      {JSON.stringify({
        dataCount: data?.length ?? 0,
        paperBg: layout?.paper_bgcolor ?? null,
        responsive: config?.responsive ?? false,
      })}
    </div>
  ),
}))

let LazyPlot

beforeAll(async () => {
  const module = await import('./LazyPlot')
  LazyPlot = module.default
})

describe('LazyPlot', () => {
  it('passes chart props into the lazily loaded Plot wrapper', async () => {
    render(
      <LazyPlot
        data={[{ x: [0, 1], y: [1, 2], type: 'scatter' }]}
        layout={{ paper_bgcolor: 'transparent' }}
        config={{ responsive: true }}
      />
    )

    const plot = await screen.findByTestId('lazy-plot-mock')
    expect(plot).toHaveTextContent('"dataCount":1')
    expect(plot).toHaveTextContent('"paperBg":"transparent"')
    expect(plot).toHaveTextContent('"responsive":true')
  })
})
