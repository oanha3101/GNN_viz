import { useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Network, BarChart3, Link2, Users, Globe2, Dna, Upload, X, CheckCircle2, Sparkles, ArrowLeft, ArrowRight, Loader2, AlertCircle, Download, Eye } from 'lucide-react'
import useGNNStore from '../../store/useGNNStore'
import { API_BASE, getAuthHeaders } from '../../utils/api'
import { logger } from '../../utils/logger'

const API = API_BASE

const TASKS = [
  { id: 1, name: 'Node Classification', Icon: Network, desc: 'Predict labels for nodes (e.g. user roles)', needsGraph: false },
  { id: 2, name: 'Graph Classification', Icon: BarChart3, desc: 'Predict labels for entire graphs (e.g. molecules)', needsGraph: true },
  { id: 3, name: 'Link Prediction', Icon: Link2, desc: 'Predict future or missing edges (e.g. recommendations)', needsGraph: false },
  { id: 4, name: 'Community Detection', Icon: Users, desc: 'Find clusters of nodes (Unsupervised)', needsGraph: false },
  { id: 5, name: 'Graph Embedding', Icon: Globe2, desc: 'Learn node representations (Unsupervised)', needsGraph: false },
  { id: 6, name: 'Graph Generation', Icon: Dna, desc: 'Learn to generate new graph structures', needsGraph: false },
]

// Data requirements per task — shown in Step 2
const TASK_REQUIREMENTS = {
  1: [
    { label: 'Nodes file', req: true },
    { label: 'Edges file', req: true },
    { label: 'Node labels (Y)', req: true },
    { label: 'Node features (X)', req: false, note: 'Auto-generated from degree if missing' },
  ],
  2: [
    { label: 'Nodes file (with graph_id)', req: true },
    { label: 'Edges file', req: true },
    { label: 'Graphs file (with label)', req: true },
    { label: 'Node features', req: false },
  ],
  3: [
    { label: 'Nodes file', req: true },
    { label: 'Edges file', req: true },
    { label: 'Edge weight', req: false, note: 'Used in loss function' },
    { label: 'Node features', req: false },
  ],
  4: [
    { label: 'Nodes file', req: true },
    { label: 'Edges file', req: true },
    { label: 'Community label (GT)', req: false, note: 'For NMI evaluation' },
    { label: 'Node features', req: false },
  ],
  5: [
    { label: 'Nodes file', req: true },
    { label: 'Edges file', req: true },
    { label: 'Node features', req: false },
  ],
  6: [
    { label: 'Nodes file', req: true },
    { label: 'Edges file', req: true },
    { label: 'Graph treated as reference structure', req: false },
  ],
}

export default function DataInputView({ onClose, variant = 'modal' }) {
  const selectedTaskFromWorkspace = useGNNStore(s => s.selectedTask)
  const [step, setStep] = useState(1)
  const [task, setTask] = useState(selectedTaskFromWorkspace || 1)
  const setMockMode = useGNNStore(s => s.setMockMode)

  // File data states
  const [nodesData, setNodesData] = useState([])
  const [edgesData, setEdgesData] = useState([])
  const [graphsData, setGraphsData] = useState([])

  // Raw files for server-side upload
  const [nodesFile, setNodesFile] = useState(null)
  const [edgesFile, setEdgesFile] = useState(null)
  const [graphsFile, setGraphsFile] = useState(null)
  const [datasetName, setDatasetNameLocal] = useState('')
  const setDatasetNameGlobal = useGNNStore(s => s.setDatasetName)
  
  const [nodeCols, setNodeCols] = useState([])
  const [edgeCols, setEdgeCols] = useState([])
  const [graphCols, setGraphCols] = useState([])

  // Mapping states (extended)
  const [mapping, setMapping] = useState({
    node_id: '',
    node_label: '',
    node_features: [],
    edge_source: '',
    edge_target: '',
    edge_weight: '',
    edge_label: '',
    edge_features: [],
    graph_id: '',
    graph_label: '',
    graph_features: [],
    community_label: '',
    is_directed: false,
    num_communities: 4,
    edge_split_ratio: 0.15,
  })

  // Validation state (Step 4)
  const [validationResult, setValidationResult] = useState(null)
  const [uploadMode, setUploadMode] = useState('auto') // 'auto' | 'client' | 'server'

  // Determine if data is large enough to warrant server-side upload
  const isLargeDataset = nodesData.length > 5000 || edgesData.length > 20000

  // Parse Excel/CSV/JSON files
  const handleFileUpload = (e, type) => {
    const file = e.target.files[0]
    if (!file) return

    // Keep raw file for potential server-side upload
    if (type === 'nodes') setNodesFile(file)
    else if (type === 'edges') setEdgesFile(file)
    else if (type === 'graphs') setGraphsFile(file)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const bstr = evt.target.result
      try {
        let jsonData = []
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(bstr)
          jsonData = Array.isArray(parsed) ? parsed : (
            Object.values(parsed).find(v => Array.isArray(v)) || [parsed]
          )
        } else {
          const wb = XLSX.read(bstr, { type: 'binary' })
          
          // Smart Multi-sheet Detection
          const sheetNames = wb.SheetNames
          const hasNodes = sheetNames.includes('Nodes')
          const hasEdges = sheetNames.includes('Edges')
          const hasGraphs = sheetNames.includes('Graphs')

          if (hasNodes || hasEdges || hasGraphs) {
             logger.info("Detected GNN-Insight Multi-sheet format. Auto-loading all sheets...")
             if (hasNodes) {
               const nodes = XLSX.utils.sheet_to_json(wb.Sheets['Nodes'])
               setNodesData(nodes)
               setNodeCols(Object.keys(nodes[0] || {}))
               if (type === 'nodes') jsonData = nodes // For the current selection flow
             }
             if (hasEdges) {
               const edges = XLSX.utils.sheet_to_json(wb.Sheets['Edges'])
               setEdgesData(edges)
               setEdgeCols(Object.keys(edges[0] || {}))
             }
             if (hasGraphs) {
               const graphs = XLSX.utils.sheet_to_json(wb.Sheets['Graphs'])
               setGraphsData(graphs)
               setGraphCols(Object.keys(graphs[0] || {}))
             }
             // If we loaded everything, we can jump to mapping or just stay here
          } else {
            const wsname = wb.SheetNames[0]
            const ws = wb.Sheets[wsname]
            jsonData = XLSX.utils.sheet_to_json(ws)
          }
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
        
        if (type === 'nodes' && !datasetName) {
           const baseName = file.name.split('.')[0].replace(/[-_]/g, ' ')
           setDatasetNameLocal(baseName.charAt(0).toUpperCase() + baseName.slice(1))
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

    m.node_id = matchCol(nodeCols, ['id', 'node_id', 'name', 'paper_id', 'pmid'])
    m.node_label = matchCol(nodeCols, ['label', 'class', 'target', 'y', 'topic', 'club'])
    m.node_features = nodeCols.filter(c => c !== m.node_id && c !== m.node_label && !c.toLowerCase().includes('graph') && !c.toLowerCase().includes('community'))
    
    m.edge_source = matchCol(edgeCols, ['source', 'src', 'from', 'citing'])
    m.edge_target = matchCol(edgeCols, ['target', 'dst', 'to', 'cited'])
    m.edge_weight = matchCol(edgeCols, ['weight', 'value'])
    m.edge_label = matchCol(edgeCols, ['label', 'type', 'relation'])
    
    m.graph_id = matchCol(graphCols, ['graph_id', 'id']) || matchCol(nodeCols, ['graph_id'])
    m.graph_label = matchCol(graphCols, ['label', 'class', 'target'])

    // Task-specific auto-detection
    m.community_label = matchCol(nodeCols, ['community', 'cluster', 'group', 'partition'])

    setMapping(m)
  }, [nodeCols, edgeCols, graphCols])

  // Trigger auto-detect when switching to mapping step
  useEffect(() => {
    if (step === 3) autoDetect()
  }, [step, autoDetect])

  const [loading, setLoading] = useState(false)

  // Client-side validation for node IDs and edge references
  const validateGraphData = useCallback(() => {
    const errors = []
    const warnings = []

    if (nodesData.length === 0) {
      errors.push("No nodes data loaded.")
      return { valid: false, errors, warnings }
    }

    if (edgesData.length === 0) {
      errors.push("No edges data loaded.")
      return { valid: false, errors, warnings }
    }

    // Check node_id column is mapped
    if (!mapping.node_id) {
      errors.push("Node ID column must be mapped.")
      return { valid: false, errors, warnings }
    }

    if (!mapping.edge_source || !mapping.edge_target) {
      errors.push("Edge source and target columns must be mapped.")
      return { valid: false, errors, warnings }
    }

    // Check duplicate node IDs
    const nodeIds = new Set()
    const duplicates = new Set()
    for (const row of nodesData) {
      const id = String(row[mapping.node_id])
      if (id === '' || id === 'undefined' || id === 'null') {
        duplicates.add('(empty)')
      } else if (nodeIds.has(id)) {
        duplicates.add(id)
      } else {
        nodeIds.add(id)
      }
    }
    if (duplicates.size > 0) {
      const sample = [...duplicates].slice(0, 5).join(', ')
      errors.push(`Duplicate node IDs found: ${sample}${duplicates.size > 5 ? ` (+${duplicates.size - 5} more)` : ''}`)
    }

    // Check edge references (source/target must exist in node set)
    if (nodeIds.size > 0) {
      const missingSources = new Set()
      const missingTargets = new Set()
      for (const row of edgesData) {
        const src = String(row[mapping.edge_source])
        const tgt = String(row[mapping.edge_target])
        if (!nodeIds.has(src)) missingSources.add(src)
        if (!nodeIds.has(tgt)) missingTargets.add(tgt)
      }
      if (missingSources.size > 0) {
        const sample = [...missingSources].slice(0, 5).join(', ')
        warnings.push(`${missingSources.size} edge sources not found in nodes: ${sample}${missingSources.size > 5 ? '...' : ''}`)
      }
      if (missingTargets.size > 0) {
        const sample = [...missingTargets].slice(0, 5).join(', ')
        warnings.push(`${missingTargets.size} edge targets not found in nodes: ${sample}${missingTargets.size > 5 ? '...' : ''}`)
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }, [nodesData, edgesData, mapping.node_id, mapping.edge_source, mapping.edge_target])

  // Download sample template
  const downloadTemplate = async () => {
    try {
      const link = document.createElement('a')
      link.href = `${API}/sample-template/${task}`
      link.download = `task${task}_sample_template.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      alert('Failed to download template: ' + e.message)
    }
  }

  // Step 4: Validate mapping against backend
  const runValidation = async () => {
    setLoading(true)
    try {
      // Client-side validation first
      const clientResult = validateGraphData()
      if (!clientResult.valid) {
        setValidationResult(clientResult)
        setLoading(false)
        return
      }

      const payload = {
        nodes: nodesData.slice(0, 100), // Send sample for validation
        edges: edgesData.slice(0, 100),
        graphs: graphsData.length > 0 ? graphsData.slice(0, 100) : null,
        mapping: { task, ...mapping }
      }
      const res = await fetch(`${API}/validate-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = await res.json()
      // Merge client warnings into backend result
      if (clientResult.warnings.length > 0) {
        result.warnings = [...(result.warnings || []), ...clientResult.warnings]
      }
      setValidationResult(result)
    } catch (e) {
      setValidationResult({ valid: false, errors: [e.message], warnings: [] })
    } finally {
      setLoading(false)
    }
  }

  // Trigger validation when entering Step 4
  useEffect(() => {
    if (step === 4) runValidation()
  }, [step])

  // Submit — uses server upload for large datasets, client JSON for small
  const handleSubmit = async () => {
    if (!mapping.node_id) return alert("Node ID mapping is required!")
    if (!mapping.edge_source || !mapping.edge_target) return alert("Edge Source/Target mapping is required!")
    const selectedTaskDef = TASKS.find(t => t.id === task)
    if (selectedTaskDef.needsGraph && !mapping.graph_id) return alert("Graph ID is required for this Task!")

    setLoading(true)
    try {
      let configRes

      const useServerUpload = uploadMode === 'server' || (uploadMode === 'auto' && isLargeDataset)

      if (useServerUpload && nodesFile && edgesFile) {
        // ── Server-side file upload (fast path for large datasets) ──
        const formData = new FormData()
        formData.append('nodes_file', nodesFile)
        formData.append('edges_file', edgesFile)
        if (graphsFile) formData.append('graphs_file', graphsFile)
        formData.append('mapping_json', JSON.stringify({ task, ...mapping, dataset_name: datasetName }))

        const res = await fetch(`${API}/upload-files`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const err = await res.json()
          const detail = err.detail
          if (typeof detail === 'object' && detail.errors) {
            throw new Error(detail.errors.join('\n'))
          }
          throw new Error(detail || "Server configuration error")
        }
        configRes = await res.json()
      } else {
        // ── Client-side JSON payload (original flow) ──
        const payload = {
          nodes: nodesData,
          edges: edgesData,
          graphs: graphsData.length > 0 ? graphsData : null,
          mapping: { task, ...mapping, dataset_name: datasetName }
        }

        const res = await fetch(`${API}/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const err = await res.json()
          const detail = err.detail
          if (typeof detail === 'object' && detail.errors) {
            throw new Error(detail.errors.join('\n'))
          }
          throw new Error(detail || "Server configuration error")
        }
        configRes = await res.json()
      }

      logger.info("Config Result:", configRes)

      const profileMetadata = {
        ...(configRes.metadata || {}),
        task_profile_id: task,
        task_profile_name: selectedTaskDef?.name || `Task ${task}`,
        task_profile_config: configRes.task_config || null,
      }

      // Update store
      setMockMode(false)
      const store = useGNNStore.getState()
      store.setUploadedFilePath(configRes.uploaded_file_path)
      store.setHyperparams({ dataset: configRes.dataset_name || 'custom' })
      setDatasetNameGlobal(configRes.dataset_name || 'custom')

      // Only push task-specific config into the active Lab state when the
      // workspace is already on the same task profile.
      if (configRes.task_config && store.selectedTask === task) {
        store.setTaskConfig(configRes.task_config)
      } else {
        store.setTaskConfig(null)
      }

      // Save upload metadata
      store.setUploadMetadata(profileMetadata)

      let syncMessage = ''
      try {
        const sourceFiles = {
          nodes_file: nodesFile?.name || null,
          edges_file: edgesFile?.name || null,
          graphs_file: graphsFile?.name || null,
        }
        const datasetPayload = {
          name: datasetName || configRes.dataset_name || 'custom',
          description: `Uploaded via DataInputView with initial profile ${selectedTaskDef?.name || `Task ${task}`}`,
          summary_json: profileMetadata,
          validation_json: {
            valid: true,
            warnings: configRes.validation_warnings || [],
            upload_mode: useServerUpload ? 'server' : 'client',
          },
          source_files_json: sourceFiles,
          processed_blob_key: configRes.uploaded_file_path || null,
        }
        const authHeaders = { 'Content-Type': 'application/json', ...getAuthHeaders() }
        const activeDatasetId = store.activeDatasetId
        const syncRes = activeDatasetId
          ? await fetch(`${API}/datasets/${activeDatasetId}/versions`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                summary_json: datasetPayload.summary_json,
                validation_json: datasetPayload.validation_json,
                source_files_json: datasetPayload.source_files_json,
                processed_blob_key: datasetPayload.processed_blob_key,
              }),
            })
          : await fetch(`${API}/datasets`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify(datasetPayload),
            })

        if (syncRes.ok) {
          const syncData = await syncRes.json()
          if (activeDatasetId) {
            store.setActiveDatasetContext(
              activeDatasetId,
              syncData.id,
              `${datasetPayload.name} • v${syncData.version} (${syncData.lifecycle})`
            )
          } else {
            store.setActiveDatasetContext(
              syncData.dataset.id,
              syncData.version.id,
              `${syncData.dataset.name} • v${syncData.version.version} (${syncData.version.lifecycle})`
            )
          }
          syncMessage = '\n🗂 Dataset metadata synced into Workspace'
        }
      } catch (syncErr) {
        console.warn('Dataset sync skipped:', syncErr)
      }

      // Set graph data for visualization
      const graphJson = configRes.graph_json || {}
      if (graphJson.graphData) {
        store.setGraphData(graphJson.graphData)
      }
      if (graphJson.groundTruth) {
        store.setGroundTruth(graphJson.groundTruth)
      }
      store.setTrainMask(Array.isArray(graphJson.trainMask) ? graphJson.trainMask : null)
      if (graphJson.classNames) {
        store.setClassNames(graphJson.classNames)
      }
      store.setTaskData({
        trainMask: Array.isArray(graphJson.trainMask) ? graphJson.trainMask : null,
        valMask: Array.isArray(graphJson.valMask) ? graphJson.valMask : null,
        testMask: Array.isArray(graphJson.testMask) ? graphJson.testMask : null,
      })
      if (graphJson.graphs) {
        store.setTaskData({
          graphs: graphJson.graphs,
          ...(graphJson.classNames ? { classNames: graphJson.classNames } : {}),
        })
      }
      if (graphJson.communityGroundTruth) {
        store.setCommunityGroundTruth(graphJson.communityGroundTruth)
      }
      if (graphJson.numCommunities) {
        store.setNumCommunities(graphJson.numCommunities)
      }
      if (graphJson.referenceGraph) {
        store.setReferenceGraph(graphJson.referenceGraph)
      }
      // Task 3: test edges
      if (graphJson.testEdges) {
        store.setTaskData({ testEdges: graphJson.testEdges })
      }

      // Show warnings if any
      const warnings = configRes.validation_warnings || []
      const meta = profileMetadata
      const msg = `✅ Thành công!\n\n` +
        `📊 ${meta.num_nodes || '?'} nodes, ${meta.num_edges || '?'} edges\n` +
        `📐 ${meta.num_features || '?'} features, ${meta.num_classes || '?'} classes\n` +
        (meta.num_graphs > 1 ? `📦 ${meta.num_graphs} graphs\n` : '') +
        `🧭 Initial profile: ${meta.task_profile_name}\n` +
        (meta.has_community_gt ? `🏘️ Community GT available\n` : '') +
        (warnings.length > 0 ? `\n⚠️ Warnings:\n${warnings.map(w => '  • ' + w).join('\n')}` : '') +
        syncMessage
      
      alert(msg)
      onClose()
    } catch (e) {
      alert("Lỗi: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const isInline = variant === 'inline'
  const Wrapper = isInline ? 'div' : 'div'
  const wrapperClassName = isInline
    ? 'uploader-inline'
    : 'fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-8 text-slate-200 font-sans'
  const cardClassName = isInline
    ? 'uploader-card'
    : 'w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col h-[85vh]'

  return (
    <Wrapper className={wrapperClassName}>
      <div className={cardClassName}>
        {/* Header */}
         <div className="uploader-header">
          <div>
            <h2 className="uploader-title">
              <Upload size={18} /> Custom Dataset Configuration
            </h2>
            <p className="uploader-sub">Upload a reusable dataset version, then choose an initial task profile for the first validation pass.</p>
          </div>
          {onClose ? (
            <button onClick={onClose} className="modal-close" aria-label="Close uploader">
              <X size={14} />
            </button>
          ) : null}
        </div>

        {/* Stepper — 4 steps now */}
        <div className="uploader-steps">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`uploader-step ${step === s ? 'uploader-step-active' : step > s ? 'uploader-step-done' : ''}`}>
              <span className="uploader-step-num">{s}</span>
              <span>{s===1 ? 'Upload' : s===2 ? 'Profile' : s===3 ? 'Mapping' : 'Validate'}</span>
            </div>
          ))}
        </div>

        {/* Dataset Name Input (Persistent) */}
        {(step === 1 || step === 3) && (
          <div className="uploader-name">
             <label className="modal-field-label shrink-0">Dataset Name</label>
             <input
               type="text"
               placeholder="Enter a friendly name for this dataset..."
               value={datasetName}
               onChange={e => setDatasetNameLocal(e.target.value)}
               className="modal-input flex-1"
             />
          </div>
        )}

        {/* Body */}
        <div className="uploader-body">
          {/* ═══════════════ STEP 1: Upload Files ═══════════════ */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['nodes', 'edges', 'graphs'].map(type => {
                  const data = type==='nodes' ? nodesData : type==='edges' ? edgesData : graphsData
                  return (
                    <div key={type} className="uploader-drop">
                      <h3 className="uploader-drop-title">{type} File</h3>
                      <p className="uploader-drop-sub">
                        {type==='nodes' && 'Needs: node_id, features'}
                        {type==='edges' && 'Needs: source, target'}
                        {type==='graphs' && '(Optional) Needs: graph_id, label'}
                      </p>

                      <label className="uploader-browse cursor-pointer">
                        <Upload size={13} /> Browse Excel/CSV/JSON
                        <input data-testid={`upload-${type}-file`} type="file" accept=".xlsx,.xls,.csv,.json" className="hidden" onChange={(e) => handleFileUpload(e, type)} />
                      </label>
                      
                      {data.length > 0 && (
                        <div className="absolute inset-x-0 bottom-0 bg-green-900/40 backdrop-blur border-t border-green-500/30 p-2 transform translate-y-0 transition-transform">
                          <span className="text-green-400 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={12} /> Loaded {data.length} rows</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Data size indicator */}
              {nodesData.length > 0 && (
                <div className={`text-xs font-mono rounded-lg px-4 py-2 border ${
                  isLargeDataset 
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400'
                }`}>
                  📊 {nodesData.length.toLocaleString()} nodes, {edgesData.length.toLocaleString()} edges
                  {isLargeDataset && ' — Large dataset detected, will use server-side upload for speed'}
                </div>
              )}

              {/* Previews */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {nodesData.length > 0 && (
                   <div className="bg-slate-950 rounded-lg border border-slate-800 p-3">
                     <h4 className="text-xs font-semibold text-slate-400 mb-2">Nodes Preview (Top 3)</h4>
                     <div className="overflow-x-auto text-[10px] text-slate-300 font-mono">
                       <table className="w-full text-left border-collapse">
                         <thead><tr className="border-b border-slate-800">{nodeCols.map(c => <th key={c} className="p-1">{c}</th>)}</tr></thead>
                         <tbody>
                           {nodesData.slice(0,3).map((r, i) => (
                             <tr key={i} className="border-b border-slate-800/50">
                               {nodeCols.map(c => <td key={c} className="p-1 truncate max-w-[80px]">{String(r[c] ?? '')}</td>)}
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
                               {edgeCols.map(c => <td key={c} className="p-1 truncate max-w-[80px]">{String(r[c] ?? '')}</td>)}
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

          {/* ═══════════════ STEP 2: Select Task ═══════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                <div className="font-semibold text-cyan-200">Choose an initial task profile</div>
                <div className="mt-1 text-cyan-100/80">
                  This profile is used for the first mapping and validation pass. It helps the uploader decide which fields are required right now. It does not permanently lock the dataset version to only one task.
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {TASKS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTask(t.id)}
                    className={`uploader-task ${task === t.id ? 'uploader-task-active' : ''}`}
                  >
                    <t.Icon size={22} className={`uploader-task-icon ${task === t.id ? 'is-active' : ''}`} />
                    <h3 className="uploader-task-name">{t.name}</h3>
                    <p className="uploader-task-desc">{t.desc}</p>
                  </button>
                ))}
              </div>

              {/* Data requirements for selected profile */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <Eye size={14} /> Data requirements for the initial profile: {TASKS.find(t => t.id === task)?.name}
                </h4>
                <div className="space-y-1.5">
                  {(TASK_REQUIREMENTS[task] || []).map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${req.req ? 'bg-red-400' : 'bg-slate-500'}`} />
                      <span className={req.req ? 'text-slate-200 font-medium' : 'text-slate-400'}>{req.label}</span>
                      {req.req && <span className="text-red-400 text-[10px]">Required</span>}
                      {!req.req && <span className="text-slate-600 text-[10px]">Optional</span>}
                      {req.note && <span className="text-slate-500 text-[10px] italic ml-1">({req.note})</span>}
                    </div>
                  ))}
                </div>
                
                {/* Download template button */}
                <button onClick={downloadTemplate} className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium rounded-lg transition-colors">
                  <Download size={12} /> Download Sample Template (.xlsx)
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════ STEP 3: Schema Mapping ═══════════════ */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4 flex items-center gap-3">
                <Sparkles size={24} className="text-indigo-300 shrink-0" />
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

                    {/* Dynamic Label Mapping */}
                    {task === 1 && (
                      <>
                        <label className="text-sm text-slate-400">Label (Y) *</label>
                        <select value={mapping.node_label} onChange={e => setMapping({...mapping, node_label: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                          <option value="">-- Select Label Column --</option>
                          {nodeCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    )}

                    {task === 4 && (
                      <>
                        <label className="text-sm text-slate-400">Community GT</label>
                        <select
                          value={mapping.community_label}
                          onChange={e => setMapping({...mapping, community_label: e.target.value})}
                          className="bg-slate-950 border border-slate-700 rounded p-2 text-sm"
                        >
                          <option value="">-- No GT (Unsupervised) --</option>
                          {nodeCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                  
                  {/* Features only for tasks that use them */}
                  {task !== 4 && task !== 6 && (
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
                  )}
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

                  {/* Directed graph toggle */}
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-sm text-slate-400">Directed Graph</label>
                    <button
                      onClick={() => setMapping({...mapping, is_directed: !mapping.is_directed})}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        mapping.is_directed ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {mapping.is_directed ? 'DIRECTED' : 'UNDIRECTED'}
                    </button>
                  </div>
                  
                  {/* Graph-level fields (Task 2 & 6) */}
                  {(task === 2 || task === 6) && (
                    <>
                      <h3 className="text-lg font-bold border-b border-slate-800 pb-2 mt-6">Graph Level</h3>
                      <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
                        <label className="text-sm text-slate-400">Graph ID {task === 2 ? '*' : ''}</label>
                        <select value={mapping.graph_id} onChange={e => setMapping({...mapping, graph_id: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                          <option value="">-- Identify Graphs --</option>
                          {[...new Set([...nodeCols, ...graphCols])].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {task === 2 && (
                          <>
                            <label className="text-sm text-slate-400">Graph Label</label>
                            <select value={mapping.graph_label} onChange={e => setMapping({...mapping, graph_label: e.target.value})} className="bg-slate-950 border border-slate-700 rounded p-2 text-sm">
                              <option value="">-- No Label --</option>
                              {graphCols.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {/* Task 3: Link Prediction specific */}
                  {task === 3 && (
                    <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <label className="text-sm text-slate-300 font-medium block mb-2">Test Edge Split Ratio</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range" min="0.05" max="0.4" step="0.05"
                          value={mapping.edge_split_ratio}
                          onChange={e => setMapping({...mapping, edge_split_ratio: parseFloat(e.target.value)})}
                          className="flex-1 accent-blue-500"
                        />
                        <span className="text-sm font-mono text-cyan-400 w-12 text-right">{(mapping.edge_split_ratio * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Percentage of edges hidden for testing. Default: 15%</p>
                    </div>
                  )}

                  {/* Task 4: Community Detection specific */}
                  {task === 4 && (
                    <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                      <label className="text-sm text-slate-300 font-medium block mb-2">Number of Communities</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" min="2" max="20"
                          value={mapping.num_communities}
                          onChange={e => setMapping({...mapping, num_communities: parseInt(e.target.value) || 4})}
                          className="w-20 bg-slate-950 border border-slate-700 rounded p-2 text-sm text-center"
                        />
                        <p className="text-[10px] text-slate-500">Target clusters for KMeans. Auto-detected from GT if available.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ STEP 4: Validate & Preview ═══════════════ */}
          {step === 4 && (
            <div className="space-y-6">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-blue-400" />
                  <span className="ml-3 text-slate-400 text-sm">Validating mapping...</span>
                </div>
              )}

              {validationResult && !loading && (
                <>
                  {/* Validation Status */}
                  <div className={`rounded-lg p-4 border flex items-start gap-3 ${
                    validationResult.valid
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    {validationResult.valid
                      ? <CheckCircle2 size={20} className="text-green-400 mt-0.5" />
                      : <AlertCircle size={20} className="text-red-400 mt-0.5" />
                    }
                    <div>
                      <h4 className={`text-sm font-bold ${validationResult.valid ? 'text-green-300' : 'text-red-300'}`}>
                        {validationResult.valid ? 'Validation Passed ✓' : 'Validation Failed'}
                      </h4>

                      {/* Errors */}
                      {validationResult.errors?.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {validationResult.errors.map((err, i) => (
                            <li key={i} className="text-xs text-red-300 flex items-start gap-1.5">
                              <span className="text-red-400 mt-0.5">✕</span> {err}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Warnings */}
                      {validationResult.warnings?.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {validationResult.warnings.map((warn, i) => (
                            <li key={i} className="text-xs text-amber-300/80 flex items-start gap-1.5">
                              <span className="text-amber-400 mt-0.5">⚠</span> {warn}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Data Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Nodes', value: nodesData.length.toLocaleString(), color: 'blue' },
                      { label: 'Edges', value: edgesData.length.toLocaleString(), color: 'cyan' },
                      { label: 'Features', value: mapping.node_features.length || 'Auto', color: 'indigo' },
                      { label: 'Profile', value: TASKS.find(t => t.id === task)?.name, color: 'purple' },
                    ].map(item => (
                      <div key={item.label} className={`bg-${item.color}-500/10 border border-${item.color}-500/20 rounded-lg p-3 text-center`}>
                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{item.label}</div>
                        <div className="text-lg font-bold text-slate-200 mt-1">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Upload mode selector for large datasets */}
                  {isLargeDataset && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-amber-300 mb-2">🚀 Large Dataset — Upload Mode</h4>
                      <div className="flex gap-3">
                        {[
                          { id: 'auto', label: 'Auto (Recommended)', desc: 'Server upload for speed' },
                          { id: 'server', label: 'Server Upload', desc: 'Files sent directly' },
                          { id: 'client', label: 'Client JSON', desc: 'Parse in browser' },
                        ].map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => setUploadMode(mode.id)}
                            className={`flex-1 p-2 rounded-lg border text-xs transition-all ${
                              uploadMode === mode.id
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                          >
                            <div className="font-bold">{mode.label}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{mode.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mapping Summary */}
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-slate-300 mb-3">Mapping Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {Object.entries(mapping).filter(([k, v]) => v && v !== '' && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                          <span className="text-slate-500 font-mono">{k}:</span>
                          <span className="text-slate-300 font-mono truncate max-w-[120px]">
                            {Array.isArray(v) ? `[${v.length} cols]` : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Re-validate button */}
                  <button onClick={runValidation} className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                    Re-run validation
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="uploader-footer">
          <button
            data-testid="data-input-back"
            className="modal-btn-ghost inline-flex items-center gap-1"
            onClick={() => step > 1 ? setStep(s => s-1) : onClose && onClose()}
          >
            {step > 1 ? <><ArrowLeft size={12} /> Back</> : 'Cancel'}
          </button>

          <button
            data-testid={step === 4 ? 'data-input-confirm' : 'data-input-continue'}
            className={`uploader-primary inline-flex items-center gap-1 ${
               (step === 1 && nodesData.length && edgesData.length) || step === 2 || step === 3 || (step === 4 && validationResult?.valid)
                 ? ''
                 : 'uploader-primary-disabled'
            }`}
            onClick={() => {
              if (step === 1 && (!nodesData.length || !edgesData.length)) return alert("Nodes and Edges files are required!")
              if (step < 4) setStep(s => s+1)
              else handleSubmit()
            }}
            disabled={loading || (step === 4 && !validationResult?.valid)}
          >
            {loading
              ? <><Loader2 size={12} className="animate-spin" /> Processing...</>
              : step === 4
                ? <>Confirm & Load Data</>
                : <>Continue <ArrowRight size={12} /></>
            }
          </button>
        </div>
      </div>
    </Wrapper>
  )
}
