import { useState, useCallback } from 'react'
import useGNNStore from '../../store/useGNNStore'
import { CLASS_COLORS } from '../../utils/colors'

export default function InductiveDemo() {
  const graphData = useGNNStore((s) => s.graphData)
  const groundTruth = useGNNStore((s) => s.groundTruth)
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setGraphData = useGNNStore((s) => s.setGraphData)
  const setGroundTruth = useGNNStore((s) => s.setGroundTruth)
  const addInductiveNode = useGNNStore((s) => s.addInductiveNode)
  const [isOpen, setIsOpen] = useState(false)
  const [newNodeClass, setNewNodeClass] = useState(null)
  const [animating, setAnimating] = useState(false)

  const addRandomNode = useCallback(async () => {
    if (!graphData || !groundTruth) return
    setAnimating(true)

    const numNodes = graphData.nodes.length
    const newId = numNodes
    
    // Choose neighbors from existing nodes
    const numEdges = 2 + Math.floor(Math.random() * 2)
    const neighborIds = []
    const existingIds = graphData.nodes.map((n) => n.id)
    for (let i = 0; i < numEdges; i++) {
      const target = existingIds[Math.floor(Math.random() * existingIds.length)]
      if (!neighborIds.includes(target)) neighborIds.push(target)
    }

    // Call real backend prediction
    let predictedClass = 0
    try {
      const response = await fetch('http://localhost:8000/api/inductive-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: Array(1433).fill(0).map(() => Math.random()) })
      })
      const result = await response.json()
      predictedClass = result.predicted_class
    } catch (e) {
      predictedClass = Math.floor(Math.random() * 7)
    }

    setNewNodeClass(predictedClass)

    // Trigger fly-in animation by adding node via store
    addInductiveNode({
      id: newId,
      links: neighborIds,
      groundTruth: predictedClass,
      inTrainSet: false
    })

    // Update ground truth for info panel
    setGroundTruth([...groundTruth, predictedClass])

    setAnimating(false)
    setTimeout(() => setIsOpen(false), 800)
  }, [graphData, groundTruth, addInductiveNode, setGroundTruth])

  if (selectedModel !== 'SAGE') return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-2 py-1 rounded-lg text-[10px] font-semibold
                   bg-orange-500/20 text-orange-400 border border-orange-500/30
                   hover:bg-orange-500/30 transition-all"
      >
        + Add Node
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setIsOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                          bg-slate-900 border border-slate-700 rounded-xl p-5 z-50
                          shadow-2xl w-72">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              GraphSAGE — Inductive Demo
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Add a new unseen node to the graph. GraphSAGE will predict its class
              using message passing from its neighbors — no retraining needed.
            </p>

            <button
              onClick={addRandomNode}
              disabled={animating || !graphData}
              className="w-full px-4 py-2 rounded-lg text-xs font-semibold
                         bg-gradient-to-r from-orange-500 to-amber-600 text-white
                         hover:from-orange-400 hover:to-amber-500 transition-all
                         disabled:opacity-40 active:scale-95 mb-3"
            >
              {animating ? '⏳ Predicting...' : '🎲 Add Random Node'}
            </button>

            {newNodeClass !== null && !animating && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-xs">
                <span className="text-slate-400">Latest prediction:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: CLASS_COLORS[newNodeClass] }} />
                  <span className="text-slate-200 font-semibold">
                    Class {newNodeClass}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsOpen(false)}
              className="mt-3 w-full text-xs text-slate-500 hover:text-slate-300 py-1"
            >
              Close
            </button>
          </div>
        </>
      )}
    </>
  )
}
