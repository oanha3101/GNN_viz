import { useCallback } from 'react'
import useGNNStore from '../store/useGNNStore'
import usePlayerStore from '../store/playerStore'

export default function ExportToolbar() {
    const snapshots = usePlayerStore((s) => s.snapshots)
    const graphData = useGNNStore((s) => s.graphData)

    const exportJSON = useCallback(() => {
        const data = {
            graphData,
            snapshots,
            exported_at: new Date().toISOString(),
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gnn-insight-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }, [snapshots, graphData])

    const exportPNG = useCallback(async () => {
        // Find the topology canvas
        const canvas = document.querySelector('.force-graph-container canvas')
        if (!canvas) {
            // Fallback: screenshot the entire main area
            alert('No graph canvas found. Please ensure a topology view is visible.')
            return
        }
        const url = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `gnn-topology-${Date.now()}.png`
        a.click()
    }, [])

    if (snapshots.length === 0) return null

    return (
        <div className="flex items-center gap-1">
            <button
                onClick={exportPNG}
                className="px-2 py-1 rounded text-[10px] font-medium
                   bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200
                   transition-all"
                title="Export topology as PNG"
            >
                📷 PNG
            </button>
            <button
                onClick={exportJSON}
                className="px-2 py-1 rounded text-[10px] font-medium
                   bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200
                   transition-all"
                title="Export all data as JSON"
            >
                💾 JSON
            </button>
        </div>
    )
}
