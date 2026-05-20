import { useMemo } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, ReferenceDot, ReferenceArea
} from 'recharts'
import useGNNStore from '../../store/useGNNStore'
import usePlayerStore from '../../store/playerStore'
import { easeInOutCubic, lerp } from '../../engine/interpolate'

export default function MetricsChart() {
    const { snapshots, currentEpochFloat, currentEpoch } = usePlayerStore()
    const selectedModel = useGNNStore((s) => s.selectedModel)
    
    // Smooth fractional progress
    const epochInt = Math.floor(currentEpochFloat)
    const t = easeInOutCubic(currentEpochFloat - epochInt)

    const { chartData, bestEpoch, tipData } = useMemo(() => {
        if (snapshots.length === 0) return { chartData: [], bestEpoch: 0, tipData: null }
        const sliced = snapshots.slice(0, currentEpoch + 2) // +2 to have the next point for line drawing

        let bestValAcc = -1
        let bestEp = 0
        const data = sliced.map((s, i) => {
            if (s.val_acc > bestValAcc) { bestValAcc = s.val_acc; bestEp = i }
            
            let sage_val_acc = null
            if (selectedModel === 'SAGE') {
                 let count = 0, sum = 0
                 for(let j = Math.max(0, i - 4); j <= i; j++) {
                     sum += sliced[j].val_acc
                     count++
                 }
                 sage_val_acc = +(sum / count).toFixed(4)
            }

            return {
                epoch: s.epoch,
                train_loss: s.train_loss != null ? +s.train_loss.toFixed(4) : null,
                val_loss: s.val_loss != null ? +s.val_loss.toFixed(4) : null,
                train_acc: s.train_acc != null ? +s.train_acc.toFixed(4) : null,
                val_acc: s.val_acc != null ? +s.val_acc.toFixed(4) : null,
                sage_val_acc,
            }
        })
        
        let tipData = null
        if (snapshots[epochInt] && snapshots[epochInt + 1]) {
            const sA = snapshots[epochInt]
            const sB = snapshots[epochInt + 1]
            
            let sA_sage = null, sB_sage = null
            if (selectedModel === 'SAGE') {
                sA_sage = data[epochInt]?.sage_val_acc || sA.val_acc
                sB_sage = data[epochInt + 1]?.sage_val_acc || sB.val_acc
            }

            tipData = {
                epoch: currentEpochFloat,
                train_loss: sA.train_loss != null && sB.train_loss != null ? lerp(sA.train_loss, sB.train_loss, t) : null,
                val_loss: sA.val_loss != null && sB.val_loss != null ? lerp(sA.val_loss, sB.val_loss, t) : null,
                train_acc: sA.train_acc != null && sB.train_acc != null ? lerp(sA.train_acc, sB.train_acc, t) : null,
                val_acc: sA.val_acc != null && sB.val_acc != null ? lerp(sA.val_acc, sB.val_acc, t) : null,
                sage_val_acc: selectedModel === 'SAGE' ? lerp(sA_sage, sB_sage, t) : null
            }
        } else if (snapshots[epochInt]) {
            tipData = { ...data[epochInt], epoch: currentEpochFloat }
        }

        return { chartData: data, bestEpoch: bestEp, tipData }
    }, [snapshots, currentEpoch, currentEpochFloat, epochInt, t])

    // Detect overfit zones: epochs where |train_acc - val_acc| > 0.1
    const overfitZones = useMemo(() => {
        if (chartData.length < 3) return []
        const zones = []
        let zoneStart = null
        for (let i = 0; i < chartData.length; i++) {
            const gap = chartData[i].train_acc - chartData[i].val_acc
            if (gap > 0.1) {
                if (zoneStart === null) zoneStart = chartData[i].epoch
            } else {
                if (zoneStart !== null) {
                    zones.push({ x1: zoneStart, x2: chartData[i - 1].epoch })
                    zoneStart = null
                }
            }
        }
        if (zoneStart !== null) {
            zones.push({ x1: zoneStart, x2: chartData[chartData.length - 1].epoch })
        }
        return zones
    }, [chartData])

    if (chartData.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
                <p>No training data yet</p>
            </div>
        )
    }

    return (
        <div className="w-full h-full pt-5 pr-2 pb-2 pl-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                    <XAxis
                        dataKey="epoch"
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                    />
                    <YAxis
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        domain={[0, 'auto']}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            fontSize: '11px',
                            color: '#e2e8f0',
                        }}
                    />
                    <ReferenceLine
                        x={bestEpoch}
                        stroke="#22c55e"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{
                            value: `Best: ${bestEpoch}`,
                            position: 'top',
                            fill: '#22c55e',
                            fontSize: 10,
                        }}
                    />
                    {/* Overfit warning zones */}
                    {overfitZones.map((zone, i) => (
                        <ReferenceArea
                            key={`overfit-${i}`}
                            x1={zone.x1}
                            x2={zone.x2}
                            fill="#f97316"
                            fillOpacity={0.08}
                            stroke="#f97316"
                            strokeOpacity={0.3}
                            strokeDasharray="3 3"
                            label={i === 0 ? {
                                value: '⚠ Overfit',
                                position: 'insideTopRight',
                                fill: '#fb923c',
                                fontSize: 9,
                                fontWeight: 'bold',
                            } : undefined}
                        />
                    ))}
                    <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="train_loss" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Train Loss" />
                    <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="val_loss" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Val Loss" />
                    <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="train_acc" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Train Acc" />
                    
                    {/* Sage model has a noisy val_acc, so we dim it out and draw a bright moving average over it */}
                    {selectedModel === 'SAGE' ? (
                        <>
                           <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="val_acc" stroke="rgba(59,130,246,0.2)" strokeWidth={1.0} dot={false} name="Val Acc (Raw)" />
                           <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="sage_val_acc" stroke="#f97316" strokeWidth={2.0} dot={false} name="Val Acc (5-avg)" />
                        </>
                    ) : (
                        <Line isAnimationActive={false} animationDuration={0} type="monotone" dataKey="val_acc" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Val Acc" />
                    )}
                    
                    {tipData && (
                        <>
                            <ReferenceDot x={tipData.epoch} y={tipData.train_loss} r={3} fill="#ef4444" stroke="none" />
                            <ReferenceDot x={tipData.epoch} y={tipData.val_loss} r={3} fill="#fb923c" stroke="none" />
                            <ReferenceDot x={tipData.epoch} y={tipData.train_acc} r={3} fill="#22c55e" stroke="none" />
                            
                            {selectedModel === 'SAGE' ? (
                                <>
                                  <ReferenceDot x={tipData.epoch} y={tipData.val_acc} r={2} fill="rgba(59,130,246,0.3)" stroke="none" />
                                  {tipData.sage_val_acc && <ReferenceDot x={tipData.epoch} y={tipData.sage_val_acc} r={4} fill="#f97316" stroke="#fff" strokeWidth={1.5} />}
                                </>
                            ) : (
                                <ReferenceDot x={tipData.epoch} y={tipData.val_acc} r={3} fill="#3b82f6" stroke="none" />
                            )}
                        </>
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
