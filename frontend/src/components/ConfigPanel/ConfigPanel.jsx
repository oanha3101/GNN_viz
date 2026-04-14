import useGNNStore from '../../store/useGNNStore'

export default function ConfigPanel() {
  const configOpen = useGNNStore((s) => s.configOpen)
  const setConfigOpen = useGNNStore((s) => s.setConfigOpen)
  const hyperparams = useGNNStore((s) => s.hyperparams)
  const setHyperparams = useGNNStore((s) => s.setHyperparams)
  const selectedModel = useGNNStore((s) => s.selectedModel)

  if (!configOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setConfigOpen(false)} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-72 bg-slate-900 border-l border-slate-700/50
                      z-50 p-4 overflow-y-auto shadow-2xl animate-slide-in">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">⚙ Configuration</h2>
          <button onClick={() => setConfigOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>

        <div className="space-y-4">
          {/* Epochs */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
              Epochs: {hyperparams.epochs}
            </label>
            <input
              type="range" min="10" max="300" step="10"
              value={hyperparams.epochs}
              onChange={(e) => setHyperparams({ epochs: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>

          {/* Learning Rate */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Learning Rate</label>
            <div className="flex gap-1">
              {[0.001, 0.01, 0.05].map((lr) => (
                <button
                  key={lr}
                  onClick={() => setHyperparams({ lr })}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all
                    ${hyperparams.lr === lr ? 'bg-blue-500/80 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  {lr}
                </button>
              ))}
            </div>
          </div>

          {/* Hidden Dims */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Hidden Dimensions</label>
            <div className="flex gap-1">
              {[16, 32, 64, 128].map((h) => (
                <button
                  key={h}
                  onClick={() => setHyperparams({ hidden: h })}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all
                    ${hyperparams.hidden === h ? 'bg-blue-500/80 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Dropout */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Dropout</label>
            <div className="flex gap-1">
              {[0.0, 0.3, 0.5].map((d) => (
                <button
                  key={d}
                  onClick={() => setHyperparams({ dropout: d })}
                  className={`flex-1 py-1 rounded text-[10px] font-medium transition-all
                    ${hyperparams.dropout === d ? 'bg-blue-500/80 text-white' : 'bg-slate-800 text-slate-400'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* GAT Heads */}
          {selectedModel === 'GAT' && (
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Attention Heads</label>
              <div className="flex gap-1">
                {[1, 2, 4, 8].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHyperparams({ heads: h })}
                    className={`flex-1 py-1 rounded text-[10px] font-medium transition-all
                      ${hyperparams.heads === h ? 'bg-green-500/80 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SAGE Aggregator */}
          {selectedModel === 'SAGE' && (
            <div>
              <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Aggregator</label>
              <div className="flex gap-1">
                {['mean', 'max', 'lstm'].map((agg) => (
                  <button
                    key={agg}
                    onClick={() => setHyperparams({ aggregator: agg })}
                    className={`flex-1 py-1 rounded text-[10px] font-medium capitalize transition-all
                      ${hyperparams.aggregator === agg ? 'bg-orange-500/80 text-white' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {agg}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.3s ease-out; }
      `}</style>
    </>
  )
}
