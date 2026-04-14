import useGNNStore from '../store/useGNNStore'

const MODELS = [
  { id: 'GCN', label: 'GCN' },
  { id: 'GAT', label: 'GAT' },
  { id: 'SAGE', label: 'GraphSAGE' },
]

export default function ModelSelectorV2() {
  const selectedModel = useGNNStore((s) => s.selectedModel)
  const setModel = useGNNStore((s) => s.setModel)

  return (
    <div className="flex items-center gap-1 rounded-2xl border border-slate-700/50 bg-slate-900/65 p-1">
      {MODELS.map((model) => {
        const active = selectedModel === model.id
        return (
          <button
            key={model.id}
            onClick={() => setModel(model.id)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
              active
                ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            {model.label}
          </button>
        )
      })}
    </div>
  )
}
