# GNN-Insight Bug Fix — Implementation Plan

## Overview

Fix 7 bugs across the GNN-Insight project (2 Critical, 3 Medium, 2 Enhancements) in the React + Vite frontend and FastAPI + PyTorch Geometric backend.

---

## Phase 1: Hardcoded API URLs → Environment-Based Constants (P0)

**Goal**: Eliminate all `localhost:8000` hardcoded URLs. The `.env` file already exists with `VITE_API_BASE_URL` and `VITE_WS_URL` but is unused.

> [!IMPORTANT]
> This is a deployment blocker — the app cannot be deployed to any non-localhost environment.

### [NEW] [api.js](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/utils/api.js)

Create a shared API utility that reads from Vite's environment variables:

```javascript
// Centralized API URL configuration
// Uses VITE_API_BASE_URL and VITE_WS_URL from .env, falls back to localhost
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/train';

export { API_BASE, WS_URL };
```

### [MODIFY] [useWebSocket.js](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/hooks/useWebSocket.js)

- **Line 46**: Replace `'ws://localhost:8000/ws/train'` → `WS_URL` (import from `../utils/api`)

### [MODIFY] [DataInputView.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/UploadPanel/DataInputView.jsx)

- **Line 141**: Replace `'http://localhost:8000/api/configure'` → `` `${API_BASE}/configure` `` (import from `../../utils/api`)

### [MODIFY] [TrainingControlsV2.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/TrainingControlsV2.jsx)

- **Line 14**: Replace `const API = 'http://localhost:8000/api'` → `import { API_BASE as API } from '../utils/api'`

### [MODIFY] [InductiveDemo.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/TopologyView/InductiveDemo.jsx)

- **Line 35**: Replace `'http://localhost:8000/api/inductive-predict'` → `` `${API_BASE}/inductive-predict` `` (import from `../../utils/api`)

### [MODIFY] [ProjectLibrary.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/Library/ProjectLibrary.jsx)

- **Line 11**: Replace `const API = 'http://localhost:8000/api'` → `import { API_BASE as API } from '../../utils/api'`

---

## Phase 2: Enable Error Mode in TopologyView (P0)

**Goal**: Re-enable the disabled misclassification visualization. Backend already sends `node_correctness` in every epoch snapshot (confirmed in `tasks/node_classification.py:83,132`).

> [!IMPORTANT]
> This restores a core diagnostic feature — users need to see which nodes the model gets wrong.

### [MODIFY] [TopologyView.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/TopologyView/TopologyView.jsx)

**Change 1 — Line 48**: Remove hardcoded override
```diff
-const showErrorsOnlySafe = false // Force disable until bug is fixed
+const showErrorsOnlySafe = showErrorsOnly // Use state variable
```

**Change 2 — Lines 202-209**: Uncomment misclassification check
```javascript
let isMisclassified = false
if (showErrorsOnlySafe && Array.isArray(nodeCorrectness) && nodeCorrectness.length > 0) {
  const nodeId = node.id
  if (typeof nodeId === 'number' && nodeId >= 0 && nodeId < nodeCorrectness.length) {
    isMisclassified = nodeCorrectness[nodeId] === 0
  }
}
```

**Change 3 — Lines 236-249**: Uncomment error highlight drawing (red pulse ring)
```javascript
if (showErrorsOnlySafe && isMisclassified) {
  const pulseRadius = 12 + Math.sin(Date.now() / 200) * 3
  ctx.beginPath()
  ctx.arc(node.x, node.y, pulseRadius, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'
  ctx.lineWidth = 2
  ctx.stroke()
  
  ctx.beginPath()
  ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'
  ctx.fill()
}
```

**Change 4 — Line 258**: Pass real `isMisclassified` to `drawTask1Node`
```diff
-isMisclassified: false // showErrorsOnlySafe && isMisclassified
+isMisclassified: showErrorsOnlySafe && isMisclassified
```

**Change 5 — Line 263**: Add `showErrorsOnly` back to dependency array
```diff
-}, [selectedModel, totalEpochs]) // Removed showErrorsOnly dependency
+}, [selectedModel, totalEpochs, showErrorsOnly])
```

**Change 6 — Lines 480-491**: Uncomment the UI toggle button
```javascript
<button
  onClick={() => setShowErrorsOnly(!showErrorsOnly)}
  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all border flex items-center gap-1.5
    ${showErrorsOnly
      ? 'bg-red-500/20 border-red-500/40 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
    }`}
>
  <span>{showErrorsOnly ? '🔴' : '⚪'}</span>
  <span>Errors Only</span>
</button>
```

### [MODIFY] [drawTask1Node.js](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/engine/drawTask1Node.js)

- **Line 2**: Destructure `isMisclassified` from `config` (it's already passed but not used)
- Add a red error ring after the main node body (around line 97) when `isMisclassified` is true:

```javascript
// Error ring for misclassified nodes
if (isMisclassified) {
  ctx.beginPath()
  ctx.arc(drawX, drawY, size + 3, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
  ctx.lineWidth = 2.5
  ctx.stroke()
}
```

---

## Phase 3: Data Upload Validation (P1)

**Goal**: Add frontend validation before sending data to the backend, preventing silent failures.

### [MODIFY] [DataInputView.jsx](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/frontend/src/components/UploadPanel/DataInputView.jsx)

Add a `validateData()` function before `handleSubmit()` (around line 121):

```javascript
const validateData = () => {
  const errors = []
  const warnings = []

  // Check for duplicate node IDs
  const nodeIds = nodesData.map(n => n[mapping.node_id])
  const uniqueIds = new Set(nodeIds)
  if (nodeIds.length !== uniqueIds.size) {
    errors.push(`Duplicate node IDs found (${nodeIds.length - uniqueIds.size} duplicates)`)
  }

  // Check for NaN node IDs
  const nanIds = nodeIds.filter(id => id === null || id === undefined || id === '')
  if (nanIds.length > 0) {
    errors.push(`${nanIds.length} nodes have empty/null IDs`)
  }

  // Check edge references
  const validNodeIds = new Set(nodeIds.map(String))
  const invalidEdges = edgesData.filter(e =>
    !validNodeIds.has(String(e[mapping.edge_source])) ||
    !validNodeIds.has(String(e[mapping.edge_target]))
  )
  if (invalidEdges.length > 0) {
    warnings.push(`${invalidEdges.length} edges reference non-existent nodes (will be dropped)`)
  }

  // Check for non-numeric features
  if (mapping.node_features.length > 0) {
    const nonNumericFeatures = mapping.node_features.filter(col =>
      nodesData.some(n => n[col] !== null && n[col] !== undefined && isNaN(parseFloat(n[col])))
    )
    if (nonNumericFeatures.length > 0) {
      warnings.push(`Features [${nonNumericFeatures.join(', ')}] contain non-numeric values (will be converted to 0)`)
    }
  }

  return { errors, warnings }
}
```

Add state for validation messages:
```javascript
const [validationResult, setValidationResult] = useState(null) // { errors: [], warnings: [] }
```

In `handleSubmit`, call validation and block on errors:
```javascript
const { errors, warnings } = validateData()
if (errors.length > 0) {
  setValidationResult({ errors, warnings })
  return
}
if (warnings.length > 0) {
  const proceed = window.confirm(
    `Warnings:\n${warnings.join('\n')}\n\nProceed anyway?`
  )
  if (!proceed) return
}
```

Display validation errors in the UI before the Submit button (Step 3).

---

## Phase 4: Expand CSV Column Auto-Detection (P1)

**Goal**: Backend `_parse_csv_edgelist()` should recognize more column name patterns.

### [MODIFY] [loaders.py](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/backend/data/loaders.py)

- **Line 94**: Expand source keywords: add `'s'`, `'node_a'`, `'head'`, `'start'`
- **Line 101**: Expand target keywords: add `'t'`, `'node_b'`, `'tail'`, `'end'`, `'dst'`

```diff
-for kw_src in ['source', 'src', 'from', 'u', 'node_1']:
+for kw_src in ['source', 'src', 'from', 'u', 'node_1', 's', 'node_a', 'head', 'start']:

-for kw_tgt in ['target', 'tgt', 'to', 'v', 'node_2']:
+for kw_tgt in ['target', 'tgt', 'to', 'v', 'node_2', 't', 'node_b', 'tail', 'end', 'dst']:
```

> [!NOTE]
> The fallback to first two columns (lines 110-113) already exists, so this is a robustness improvement.

---

## Phase 5: CORS Configuration (P1)

**Goal**: Allow the backend to accept requests from any origin in dev mode, or use an environment variable.

### [MODIFY] [main.py](file:///Users/nguyenthanhhuyen/Downloads/TEST_GNN-oanh/backend/main.py)

- **Lines 47-53**: Use `CORS_ORIGINS` environment variable with sensible dev defaults:

```python
import os

cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> [!WARNING]
> Using `allow_origins=["*"]` is for dev/demo only. For production, set `CORS_ORIGINS=https://your-domain.com` as an environment variable.

---

## Files Summary

| Phase | Priority | Files Modified | New Files |
|-------|----------|---------------|-----------|
| 1 | P0 | 5 FE files | `frontend/src/utils/api.js` |
| 2 | P0 | `TopologyView.jsx`, `drawTask1Node.js` | — |
| 3 | P1 | `DataInputView.jsx` | — |
| 4 | P1 | `backend/data/loaders.py` | — |
| 5 | P1 | `backend/main.py` | — |

**Total: 8 files modified, 1 new file**

---

## Verification Plan

### Automated Tests

1. **Build check**: `cd frontend && npm run build` — ensures no import/syntax errors
2. **Grep check**: `grep -rn 'localhost:8000' frontend/src/` — should return 0 results after Phase 1

### Manual Verification

1. **Phase 1**: Change `.env` values → verify frontend connects to new URLs
2. **Phase 2**: Start training Task 1 → toggle "Errors Only" → confirm red ring around misclassified nodes
3. **Phase 3**: Upload a CSV with duplicate IDs → verify error message appears
4. **Phase 4**: Upload CSV with columns named `s` and `t` → verify auto-detected
5. **Phase 5**: Run frontend on port 3000 instead of 5173 → verify CORS passes
