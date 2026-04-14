import { useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import useGNNStore from '../../store/useGNNStore'

const TASKS = [
  { id: 1, name: 'Node Classification', icon: '🔵', desc: 'Predict labels for nodes (e.g. user roles)', needsGraph: false },
  { id: 2, name: 'Graph Classification', icon: '📊', desc: 'Predict labels for entire graphs (e.g. molecules)', needsGraph: true },
  { id: 3, name: 'Link Prediction', icon: '🔗', desc: 'Predict future or missing edges (e.g. recommendations)', needsGraph: false },
  { id: 4, name: 'Community Detection', icon: '🏘️', desc: 'Find clusters of nodes (Unsupervised)', needsGraph: false },
  { id: 5, name: 'Graph Embedding', icon: '🌌', desc: 'Learn node representations (Unsupervised)', needsGraph: false },
  { id: 6, name: 'Graph Generation', icon: '🧬', desc: 'Learn to generate new graph structures', needsGraph: true },
]

export default function DataInputView({ onClose }) {
  const [step, setStep] = useState(1)
  const [task, setTask] = useState(1)
  const setMockMode = useGNNStore(s => s.setMockMode)

  // File data states
  const [nodesData, setNodesData] = useState([])
  const [edgesData, setEdgesData] = useState([])
  const [graphsData, setGraphsData] = useState([])
  
  const [nodeCols, setNodeCols] = useState([])
  const [edgeCols, setEdgeCols] = useState([])
  const [graphCols, setGraphCols] = useState([])

  // Mapping states
  const [mapping, setMapping] = useState({
    node_id: '',
    node_label: '',
    node_features: [],
    edge_source: '',
    edge_target: '',
    edge_weight: '',
    edge_label: '',
    graph_id: '',
    graph_label: '',
  })

  // Parse Excel/CSV/JSON files
  const handleFileUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target.result
      try {
        let jsonData = []
        if (file.name.endsWith('.json')) {
          jsonData = JSON.parse(bstr)
        } else {
          const wb = XLSX.read(bstr, { type: 'binary' })
          const wsname = wb.SheetNames[0]
          const ws = wb.Sheets[wsname]
          jsonData = XLSX.utils.sheet_to_json(ws)
        }

        if (!jsonData || jsonData.length === 0) throw new Error("File is empty or invalid format")
        
        const cols = Object.keys(jsonData[0])
        
        if (type === 'nodes') {
          setNodesData(jsonData)
          setNodeCols(cols)
        } else if (type === 'edges') {
          setEdgesData(jsonData)
          setEdgeCols(cols)
        } else if (type === 'graphs') {
          setGraphsData(jsonData)
          setGraphCols(cols)
        }
      } catch (err) {
        alert("Error parsing file: " + err.message)
      }
    }
    
    if (file.name.endsWith('.json')) {
      reader.readAsText(file)
    } else {
      reader.readAsBinaryString(file)
    }
  }

  // Auto detect columns
  const autoDetect = useCallback(() => {
    const m = { ...mapping }
    const matchCol = (cols, keywords) => {
      const lowerCols = cols.map(c => c.toLowerCase())
      for (let kw of keywords) {
        const idx = lowerCols.findIndex(c => c.includes(kw))
        if (idx >= 0) return cols[idx]
      }
      return ''
    }

    m.node_id = matchCol(nodeCols, ['id', 'node_id', 'name'])
    m.node_label = matchCol(nodeCols, ['label', 'class', 'target', 'y'])
    m.node_features = nodeCols.filter(c => c !== m.node_id && c !== m.node_label && !c.toLowerCase().includes('graph'))
    
    m.edge_source = matchCol(edgeCols, ['source', 'src', 'from'])
    m.edge_target = matchCol(edgeCols, ['target', 'dst', 'to'])
    m.edge_weight = matchCol(edgeCols, ['weight', 'value'])
    m.edge_label = matchCol(edgeCols, ['label', 'type', 'relation'])
    
    m.graph_id = matchCol(graphCols, ['graph_id', 'id']) || matchCol(nodeCols, ['graph_id'])
    m.graph_label = matchCol(graphCols, ['label', 'class', 'target'])

    setMapping(m)
  }, [nodeCols, edgeCols, graphCols])

  // Trigger auto-detect when switching to mapping step
  useEffect(() => {
    if (step === 3) autoDetect()
  }, [step, autoDetect])

  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    // Validate
    if (!mapping.node_id) return alert("Node ID mapping is required!")
    if (!mapping.edge_source || !mapping.edge_target) return alert("Edge Source/Target mapping is required!")
    const selectedTaskDef = TASKS.find(t => t.id === task)
    if (selectedTaskDef.needsGraph && !mapping.graph_id) return alert("Graph ID is required for this Task!")

    setLoading(true)
    try {
      const payload = {
        nodes: nodesData,
        edges: edgesData,
        graphs: graphsData.length > 0 ? graphsData : null,
        mapping: {
          task: task,
          ...mapping
        }
      }

      console.log("Sending config payload...", payload)
      const res = await fetch('http://localhost:8000/api/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Server configuration error")
      }

      const configRes = await res.json()
      console.log("Config Result:", configRes)
      
      // Update store to exit Mock Mode
      setMockMode(false)
      const store = useGNNStore.getState()
      store.setTask(task)
      
      // Save uploaded file info so TrainingControls can send it in WS
      useGNNStore.getState().setUploadedFilePath(configRes.uploaded_file_path)
      store.setHyperparams({ dataset: configRes.dataset_name || 'custom' })

      // Properly set graph data for visualization
      const graphJson = configRes.graph_json || {}
      if (graphJson.graphData) {
        store.setGraphData(graphJson.graphData)
      }
      if (graphJson.groundTruth) {
        useGNNStore.getState().setGroundTruth(graphJson.groundTruth)
      }
      // For graph-level tasks, also store the graphs list
      if (graphJson.graphs) {
        useGNNStore.getState().setTaskData({ graphs: graphJson.graphs })
      }
      
      alert(`Thành công! Đã tải ${configRes.metadata.num_nodes} nút, ${configRes.metadata.num_edges} cạnh, ${configRes.metadata.num_features} đặc trưng, ${configRes.metadata.num_classes} lớp.`)
      
      onClose()
    } catch (e) {
      alert("Lỗi: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-8 text-slate-200 font-sans">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Custom Dataset Configuration
            </h2>
            <p className="text-sm text-slate-400">Map your own nodes and edges to train a GNN model.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-slate-800 bg-slate-900/50">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 py-3 text-center border-b-2 text-sm font-semibold transition-colors
              ${step === s ? 'border-blue-500 text-blue-400' : 
                step > s ? 'border-green-500/50 text-green-500' : 'border-transparent text-slate-600'}`
            }>
              Step {s}: {s===1 ? 'Upload Data' : s===2 ? 'Select Task' : 'Schema Mapping'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['nodes', 'edges', 'graphs'].map(type => {
                  const data = type==='nodes' ? nodesData : type==='edges' ? edgesData : graphsData
                  return (
                    <div key={type} className="border border-slate-700 bg-slate-800/30 rounded-lg p-5 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                      <h3 className="text-lg font-bold capitalize text-slate-300 mb-2">{type} File</h3>
                      <p className="text-xs text-slate-500 mb-4 h-8">
                        {type==='nodes' && 'Needs: node_id, features'}
                        {type==='edges' && 'Needs: source, target'}
                        {type==='graphs' && '(Optional) Needs: graph_id'}
                      </p>
                      
                      <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">
                        Browse Excel/JSON
                        <input type="file" accept=".xlsx,.xls,.csv,.json" className="hidden" onChange={(e) => handleFileUpload(e, type)} />
                      </label>
                      
                      {data.length > 0 && (
                        <div className="absolute inset-x-0 bottom-0 bg-green-900/40 backdrop-blur border-t border-green-500/30 p-2 transform translate-y-0 transition-transform">
                          <span className="text-green-400 text-xs font-bold">✓ Loaded {data.length} rows</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Previews */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                {nodesData.length > 0 && (
                   <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
                     <h4 className="text-xs font-semibold text-slate-400 mb-2">Nodes Preview (Top 3)</h4>
                     <div className="overflow-x-auto text-[10px] text-slate-300 font-mono">
                       <table className="w-full text-left border-collapse">
                         <thead><tr className="border-b border-slate-800">{nodeCols.map(c => <th key={c} className="p-1">{c}</th>)}</tr></thead>
                         <tbody>
                           {nodesData.slice(0,3).map((r, i) => (
                             <tr key={i} className="border-b border-slate-800/50">
                               {nodeCols.map(c => <td key={c} className="p-1 truncate max-w-[80px]">{String(r[c])}</td>)}
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                )}
                {edgesData.length > 0 && (
                   <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
                     <h4 className="text-xs font-semibold text-slate-400 mb-2">Edges Preview (Top 3)</h4>
                     <div className="overflow-x-auto text-[10px] text-slate-300 font-mono">
                       <table className="w-full text-left border-collapse">
                         <thead><tr className="border-b border-slate-800">{edgeCols.map(c => <th key={c} className="p-1">{c}</th>)}</tr></thead>
                         <tbody>
                           {edgesData.slice(0,3).map((r, i) => (
                             <tr key={i} className="border-b border-slate-800/50">
                               {edgeCols.map(c => <td key={c} className="p-1 truncate max-w-[80px]">{String(r[c])}</td>)}
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {TASKS.map(t => (
                <button 
                  key={t.id}
                  onClick={() => setTask(t.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    task === t.id 
                      ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]' 
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <div className="text-3xl mb-2">{t.icon}</div>
                  <h3 className="font-bold text-slate-200">{t.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{t.desc}</p>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4 flex items-center gap-3">
                <span className="text-2xl">✨</span>
                <div>
                  <h4 className="text-sm font-bold text-indigo-300">Auto-Detected Mapping</h4>
                  <p className="text-xs text-indigo-200/70">Please review the detected columns before submitting.</p>
                </div>
                <button onClick={autoDetect} className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-md transition-colors">
                  Re-detect
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Node Schema */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold border-b border-slate-800 pb-2">Nodes Fields</h3>
                  <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                    <label className="text-sm text-slate-400">Node ID *</label>
                    <select value={mapping.node_id} onChange={e => setMapping({...mapping, node_id: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                      <option value="">-- Select Column --</option>
                      {nodeCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <label className="text-sm text-slate-400">Label (Y)</label>
                    <select value={mapping.node_label} onChange={e => setMapping({...mapping, node_label: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                      <option value="">-- Unsupervised / None --</option>
                      {nodeCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">Features (X)</label>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border border-slate-800 rounded p-2 bg-slate-950/50">
                      {nodeCols.map(c => {
                        const isSel = mapping.node_features.includes(c);
                        return (
                          <button key={c} onClick={() => {
                            const newF = isSel ? mapping.node_features.filter(x => x!==c) : [...mapping.node_features, c]
                            setMapping({...mapping, node_features: newF})
                          }} className={`px-2 py-1 rounded text-xs transition-colors ${isSel ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Edge Schema */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold border-b border-slate-800 pb-2">Edges Fields</h3>
                  <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                    <label className="text-sm text-slate-400">Source *</label>
                    <select value={mapping.edge_source} onChange={e => setMapping({...mapping, edge_source: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                      <option value="">-- Select Column --</option>
                      {edgeCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <label className="text-sm text-slate-400">Target *</label>
                    <select value={mapping.edge_target} onChange={e => setMapping({...mapping, edge_target: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                      <option value="">-- Select Column --</option>
                      {edgeCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <label className="text-sm text-slate-400">Weight</label>
                    <select value={mapping.edge_weight} onChange={e => setMapping({...mapping, edge_weight: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                      <option value="">-- Unweighted --</option>
                      {edgeCols.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  
                  {TASKS.find(t=>t.id===task)?.needsGraph && (
                    <>
                      <h3 className="text-lg font-bold border-b border-slate-800 pb-2 mt-6">Graph Level (Task 2 & 6)</h3>
                      <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                        <label className="text-sm text-slate-400">Graph ID *</label>
                        <select value={mapping.graph_id} onChange={e => setMapping({...mapping, graph_id: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                          <option value="">-- Identify Multiple Graphs --</option>
                          {[...new Set([...nodeCols, ...graphCols])].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-between bg-slate-900/80">
          <button 
            className="px-5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white"
            onClick={() => step > 1 ? setStep(s => s-1) : onClose()}
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>
          
          <button 
            className={`px-8 py-2 rounded-lg text-sm font-bold shadow-lg transition-all ${
               (step === 1 && nodesData.length && edgesData.length) || step === 2 || step === 3
                 ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:shadow-blue-500/40' 
                 : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            onClick={() => {
              if (step === 1 && (!nodesData.length || !edgesData.length)) return alert("Nodes and Edges files are required!")
              if (step < 3) setStep(s => s+1)
              else handleSubmit()
            }}
            disabled={loading}
          >
            {loading ? 'Processing...' : step === 3 ? 'Confirm & Load Data' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
