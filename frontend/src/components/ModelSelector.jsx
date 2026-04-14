import useGNNStore from '../store/useGNNStore'
import { MODEL_COLORS } from '../utils/colors'

const models = ['GCN', 'GAT', 'SAGE']

export default function ModelSelector() {
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setModel = useGNNStore((s) => s.setModel)

  return (
    <div className="flex gap-1">
      {models.map((m) => (
        <button
          key={m}
          onClick={() => setModel(m)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
            ${selectedModel === m
              ? 'text-white shadow-lg'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          style={selectedModel === m ? {
            backgroundColor: MODEL_COLORS[m],
            boxShadow: `0 4px 15px ${MODEL_COLORS[m]}33`,
          } : {}}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
