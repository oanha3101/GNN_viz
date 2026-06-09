import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { motion } from 'framer-motion'

const CLASS_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#ec4899']

export default function LatentSpaceVisualization({ snapshot, graphData, selectedNodeId }) {
  const embeddings = snapshot?.embeddings_2d || snapshot?.tsne_2d || []
  const predictions = snapshot?.node_predictions || []
  const groundTruth = graphData?.nodes?.map((n) => n.groundTruth) || []
  const confidence = snapshot?.node_confidence || []

  const { classGroups, separation } = useMemo(() => {
    if (!embeddings.length || !predictions.length) return { classGroups: {}, separation: null }

    const groups = {}
    embeddings.forEach((emb, i) => {
      if (i >= predictions.length) return
      const cls = predictions[i]
      if (!groups[cls]) groups[cls] = []
      groups[cls].push({
        x: emb[0] || 0,
        y: emb[1] || 0,
        id: i,
        prediction: cls,
        groundTruth: groundTruth[i] ?? -1,
        confidence: confidence[i] ?? 0,
        correct: groundTruth[i] === cls,
      })
    })

    const centroids = {}
    Object.entries(groups).forEach(([cls, points]) => {
      if (!points.length) return
      centroids[cls] = {
        x: points.reduce((s, p) => s + p.x, 0) / points.length,
        y: points.reduce((s, p) => s + p.y, 0) / points.length,
      }
    })

    let intraSum = 0
    let intraCount = 0
    Object.entries(groups).forEach(([cls, points]) => {
      const c = centroids[cls]
      if (!c) return
      points.forEach((p) => {
        intraSum += Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2)
        intraCount++
      })
    })

    let interSum = 0
    let interCount = 0
    const clsList = Object.keys(centroids)
    for (let i = 0; i < clsList.length; i++) {
      for (let j = i + 1; j < clsList.length; j++) {
        const c1 = centroids[clsList[i]]
        const c2 = centroids[clsList[j]]
        interSum += Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2)
        interCount++
      }
    }

    const intraAvg = intraCount > 0 ? intraSum / intraCount : 0
    const interAvg = interCount > 0 ? interSum / interCount : 0
    const ratio = interAvg / (intraAvg + 1e-10)

    return {
      classGroups: groups,
      separation: {
        ratio: ratio.toFixed(2),
        interAvg: interAvg.toFixed(2),
        intraAvg: intraAvg.toFixed(2),
        label: ratio > 3 ? 'Well Separated' : ratio > 1.5 ? 'Moderate' : 'Overlapping',
        color: ratio > 3 ? '#22c55e' : ratio > 1.5 ? '#f59e0b' : '#ef4444',
      },
    }
  }, [embeddings, predictions, groundTruth, confidence])

  if (!embeddings.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/45 py-12 text-slate-500">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/70 text-sm font-semibold text-slate-300">
          2D
        </div>
        <p className="text-sm font-semibold text-slate-300">No embedding view yet</p>
        <p className="mt-1 text-xs text-slate-500">Embeddings appear once the run exports a 2D projection.</p>
      </div>
    )
  }

  const scatterData = useMemo(() => {
    return Object.entries(classGroups).map(([cls, points]) => ({
      cls: parseInt(cls, 10),
      name: `Class ${cls}`,
      points: points.map((p) => ({
        ...p,
        isSelected: p.id === selectedNodeId,
      })),
    }))
  }, [classGroups, selectedNodeId])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {separation && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/60 bg-slate-950/35 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Separation</span>
            <span className="text-sm font-bold" style={{ color: separation.color }}>
              {separation.ratio}x
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: `${separation.color}20`, color: separation.color }}
            >
              {separation.label}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">
            Inter: {separation.interAvg} / Intra: {separation.intraAvg}
          </div>
        </div>
      )}

      <div className="h-[300px] w-full rounded-xl border border-slate-800/70 bg-slate-950/45 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
            <XAxis
              type="number"
              dataKey="x"
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="y"
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: 'var(--c-bg-elev)', border: '1px solid var(--c-border)', color: 'var(--c-fg)', borderRadius: 8, fontSize: 10 }}
              content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0].payload
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs">
                    <div className="font-bold text-slate-100">Node #{d.id}</div>
                    <div className="text-slate-400">Pred: C{d.prediction}</div>
                    <div className="text-slate-400">True: C{d.groundTruth}</div>
                    <div className="text-slate-400">Conf: {(d.confidence * 100).toFixed(0)}%</div>
                    <div className={d.correct ? 'text-emerald-400' : 'text-red-400'}>
                      {d.correct ? 'Correct' : 'Wrong'}
                    </div>
                  </div>
                )
              }}
            />
            {scatterData.map((group) => (
              <Scatter
                key={group.cls}
                name={group.name}
                data={group.points}
                fill={CLASS_COLORS[group.cls % CLASS_COLORS.length]}
                fillOpacity={0.6}
                strokeWidth={group.points.some((p) => p.isSelected) ? 2 : 0}
                stroke={group.points.some((p) => p.isSelected) ? '#ffffff' : 'none'}
              />
            ))}
            <Legend
              wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
              iconType="circle"
              iconSize={8}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(classGroups).map(([cls, points]) => {
          const correct = points.filter((p) => p.correct).length
          const avgConf = points.reduce((s, p) => s + p.confidence, 0) / points.length
          return (
            <div key={cls} className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[cls % CLASS_COLORS.length] }} />
                <span className="text-[10px] font-bold text-slate-300">Class {cls}</span>
              </div>
              <div className="text-[10px] text-slate-400">
                {points.length} nodes | {correct}/{points.length} correct | {(avgConf * 100).toFixed(0)}% avg conf
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
