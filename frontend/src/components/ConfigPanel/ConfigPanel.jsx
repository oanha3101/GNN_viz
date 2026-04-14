
import { motion, AnimatePresence } from 'framer-motion'
import { X, SlidersHorizontal, Layers, Gauge, Droplets, Eye, Shuffle } from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'

export default function ConfigPanel() {
  const configOpen = useGNNStore((s) => s.configOpen)
  const setConfigOpen = useGNNStore((s) => s.setConfigOpen)
  const hyperparams = useGNNStore((s) => s.hyperparams)
  const setHyperparams = useGNNStore((s) => s.setHyperparams)
  const selectedModel = useGNNStore((s) => s.selectedModel)

  return (
    <AnimatePresence>
      {configOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#020617]/60 backdrop-blur-sm z-40"
            onClick={() => setConfigOpen(false)}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-[320px] bg-[#071120]/95 border-l border-slate-800/80
                      z-50 p-6 overflow-y-auto shadow-2xl backdrop-blur-xl custom-scrollbar"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-[0.15em] flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-cyan-400" />
                  Hyperparameters
                </h2>
                <div className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest mt-1">Model Configuration</div>
              </div>
              <button
                onClick={() => setConfigOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-8">
              {/* Epochs */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                   <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1.5">
                    <Layers size={12} /> Training Epochs
                  </label>
                  <span className="text-xs font-mono text-cyan-400 font-bold">{hyperparams.epochs}</span>
                </div>
                <input
                  type="range" min="10" max="1000" step="10"
                  value={hyperparams.epochs}
                  onChange={(e) => setHyperparams({ epochs: Number(e.target.value) })}
                  className="w-full accent-cyan-500 bg-slate-800 rounded-lg h-1.5 appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-slate-600 font-bold">
                  <span>10</span>
                  <span>500</span>
                  <span>1000</span>
                </div>
              </div>

              {/* Learning Rate */}
              <div className="space-y-3">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block flex items-center gap-1.5">
                  <Gauge size={12} /> Learning Rate
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[0.001, 0.01, 0.1].map((lr) => (
                    <button
                      key={lr}
                      onClick={() => setHyperparams({ lr })}
                      className={`py-2 rounded-lg text-[10px] font-mono font-bold transition-all border
                        ${hyperparams.lr === lr
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.15)]'
                          : 'bg-slate-900/50 text-slate-500 border-slate-800/60 hover:border-slate-700'}`}
                    >
                      {lr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden Dims */}
              <div className="space-y-3">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block flex items-center gap-1.5">
                  <Layers size={12} /> Hidden Dimensions
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[16, 32, 64, 128].map((h) => (
                    <button
                      key={h}
                      onClick={() => setHyperparams({ hidden: h })}
                      className={`py-2 rounded-lg text-[10px] font-mono font-bold transition-all border
                        ${hyperparams.hidden === h
                          ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                          : 'bg-slate-900/50 text-slate-500 border-slate-800/60 hover:border-slate-700'}`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dropout */}
              <div className="space-y-3">
                <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest block flex items-center gap-1.5">
                  <Droplets size={12} /> Dropout Rate
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[0.0, 0.3, 0.5].map((d) => (
                    <button
                      key={d}
                      onClick={() => setHyperparams({ dropout: d })}
                      className={`py-2 rounded-lg text-[10px] font-mono font-bold transition-all border
                        ${hyperparams.dropout === d
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                          : 'bg-slate-900/50 text-slate-500 border-slate-800/60 hover:border-slate-700'}`}
                    >
                      {d.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* GAT Heads */}
              {selectedModel === 'GAT' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <label className="text-[10px] uppercase font-bold tracking-widest block text-emerald-400 flex items-center gap-1.5">
                    <Eye size={12} /> Attention Heads
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 4, 8].map((h) => (
                      <button
                        key={h}
                        onClick={() => setHyperparams({ heads: h })}
                        className={`py-2 rounded-lg text-[10px] font-mono font-bold transition-all border
                          ${hyperparams.heads === h
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-900/50 text-slate-500 border-slate-800/60 hover:border-slate-700'}`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* SAGE Aggregator */}
              {selectedModel === 'SAGE' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <label className="text-[10px] uppercase font-bold tracking-widest block text-amber-400 flex items-center gap-1.5">
                    <Shuffle size={12} /> Aggregator Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['mean', 'max', 'lstm'].map((agg) => (
                      <button
                        key={agg}
                        onClick={() => setHyperparams({ aggregator: agg })}
                        className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all border
                          ${hyperparams.aggregator === agg
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-slate-900/50 text-slate-500 border-slate-800/60 hover:border-slate-700'}`}
                      >
                        {agg}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            <div className="mt-12 p-4 rounded-xl border border-slate-800/40 bg-slate-900/20">
               <div className="text-[9px] text-slate-500 font-medium leading-relaxed italic">
                * Changes are applied instantly for mock training and for the next session in live mode.
               </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
