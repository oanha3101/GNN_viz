import { Suspense, lazy } from 'react'

const Plot = lazy(() => import('../../lib/plotlyReact'))

function PlotFallback() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
      Loading chart...
    </div>
  )
}

export default function LazyPlot(props) {
  return (
    <Suspense fallback={<PlotFallback />}>
      <Plot {...props} />
    </Suspense>
  )
}
