import useGNNStore from '../store/useGNNStore'

const MODELS = [
  { id: 'GCN', label: 'GCN', color: '#3b82f6' },
  { id: 'GAT', label: 'GAT', color: '#22c55e' },
  { id: 'SAGE', label: 'GraphSAGE', color: '#f97316' },
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
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 ${
              active
                ? 'text-slate-950 shadow-lg'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
            style={active ? {
              backgroundColor: model.color,
              boxShadow: `0 4px 15px ${model.color}33`,
            } : {}}
          >
            {model.label}
          </button>
        )
      })}
    </div>
  )
}
