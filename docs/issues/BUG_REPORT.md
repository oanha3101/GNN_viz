# GNN-Insight: Bug Report & Fix Recommendations

## 📋 Executive Summary

| Status | Count |
|--------|-------|
| **Critical Bugs** | 2 |
| **Medium Bugs** | 3 |
| **Enhancements** | 4 |
| **Total Issues** | 9 |

---

## 🔴 CRITICAL BUGS

### Bug 1: Task 1 Error Mode Disabled (Breaking Feature)

**Location:** `frontend/src/components/TopologyView/TopologyView.jsx:47-48`

**Current Code:**
```javascript
const [showErrorsOnly, setShowErrorsOnly] = useState(false)
const showErrorsOnlySafe = false // Force disable until bug is fixed
```

**Problem:** Error highlighting functionality is completely disabled. Users cannot identify misclassified nodes.

**Impact:** 
- Reduces diagnostic capability (breaks core "B > A" value proposition)
- No way to identify which nodes the model gets wrong

**Fix Required:**
1. Remove hardcoded `showErrorsOnlySafe = false`
2. Use state variable: `const showErrorsOnlySafe = showErrorsOnly`
3. Ensure `node_correctness` is available in snapshot data
4. Add visual highlight (red ring/pulse) for misclassified nodes

**Backend Support:** ✅ Already exists - `node_correctness` is returned in epoch snapshots

---

### Bug 2: Hardcoded API URLs (Deployment Blocker)

**Locations:**
- `frontend/src/hooks/useWebSocket.js:46`
- `frontend/src/components/UploadPanel/DataInputView.jsx:141`
- `frontend/src/components/TrainingControlsV2.jsx:14`
- `frontend/src/components/TopologyView/InductiveDemo.jsx:35`
- `frontend/src/components/Library/ProjectLibrary.jsx:11`

**Current Code (example):**
```javascript
const wsUrl = 'ws://localhost:8000/ws/train'
const API = 'http://localhost:8000/api'
```

**Problem:** All API endpoints hardcoded to `localhost:8000`. Project already has `.env` with `VITE_API_BASE_URL` but FE doesn't use it.

**Impact:**
- Cannot deploy to different environments (staging, production)
- Cannot run FE/BE on different ports
- Breaks when backend runs on different machine

**Fix Required:**
1. Create shared API utility:
```javascript
// frontend/src/utils/api.js
export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/train';
```

2. Replace all hardcoded URLs with imported constants

---

## 🟡 MEDIUM BUGS

### Bug 3: Upload Data Validation Missing

**Location:** 
- `backend/api/user_loader.py`
- `frontend/src/components/UploadPanel/DataInputView.jsx`

**Problems:**
1. No frontend validation before upload
2. Silent failures when data is malformed
3. User doesn't know what went wrong

**Current Behavior:**
- NaN node IDs → silently dropped
- Invalid edge references → silently dropped  
- Text in feature columns → converted to 0

**Fix Required:**
1. Add pre-upload validation in FE:
   - Check node_id uniqueness
   - Check edge source/target exist in node list
   - Show warning for non-numeric features

2. Improve error messages in BE response

---

### Bug 4: Cora Dataset Not in Supported Formats

**Location:** `backend/data/loaders.py:87-131`

**Problem:** `_parse_csv_edgelist()` expects specific column names. When uploading Cora-like CSV files with different column names, auto-detection may fail.

**Current Auto-detect Keywords:**
```python
src_col: ['source', 'src', 'from', 'u', 'node_1']
tgt_col: ['target', 'tgt', 'to', 'v', 'node_2']
```

**Fix Required:**
1. Expand keyword list: `['s', 't']`, `['node_a', 'node_b']`
2. Add fallback: use first two columns if no keywords found
3. Show user which columns were detected

---

### Bug 5: CORS Configuration Too Restrictive

**Location:** `backend/main.py:47-53`

**Current Code:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    ...
)
```

**Problem:** CORS only allows Vite dev server port 5173. If Vite runs on different port, requests fail.

**Fix Required:**
```python
# Option 1: Allow all (dev only)
allow_origins=["*"]

# Option 2: Use environment variable
import os
allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")]
```

---

## 🔵 ENHANCEMENTS NEEDED

### Enhancement 1: Task 5/6 Backend Signals Not Used

**Problem:** Backend calculates valuable signals but FE doesn't display them:

| Backend Signal | Task | FE Status |
|----------------|------|-----------|
| `outlier_scores` | 5 | ❌ Not displayed |
| `per_edge_reconstruction_error` | 5 | ⚠️ Partially in Inspector |
| `comparison_metrics` | 6 | ❌ Not displayed |

**Fix Required:**
1. Task 5: Add outlier visualization in NodeInspector
2. Task 6: Add comparison metrics panel

---

### Enhancement 2: Error Boundary Could Be More Graceful

**Location:** `frontend/src/components/ErrorBoundary.jsx`

**Current:** Shows red error screen with message

**Improvement:** Add "Try Again" button and detailed error logging

---

### Enhancement 3: WebSocket Reconnection Logic

**Location:** `frontend/src/hooks/useWebSocket.js:23-39`

**Current:** Fixed 2-second delay, max 5 attempts

**Improvement:** Make configurable with exponential backoff

---

### Enhancement 4: Snapshot Schema Versioning

**Problem:** No contract between BE and FE on snapshot fields. New fields may break old FE versions.

**Fix Required:**
Add `schema_version` to all epoch snapshots:
```python
{
    "schema_version": "1.0",
    "epoch": 1,
    "loss": 0.5,
    ...
}
```

---

## 📝 DETAILED FIX INSTRUCTIONS

### Fix 1: Enable Error Mode in TopologyView

**File:** `frontend/src/components/TopologyView/TopologyView.jsx`

**Lines 47-48 - Change from:**
```javascript
const [showErrorsOnly, setShowErrorsOnly] = useState(false)
const showErrorsOnlySafe = false // Force disable until bug is fixed
```

**To:**
```javascript
const [showErrorsOnly, setShowErrorsOnly] = useState(false)
const showErrorsOnlySafe = showErrorsOnly // Use state variable
```

**Lines around 185-265 - Add node correctness check:**
```javascript
// Check if node is misclassified
const nodeCorrectness = state.nodeCorrectness || [];
const isMisclassified = showErrorsOnlySafe && nodeCorrectness.length > 0 
  ? nodeCorrectness[node.id] === false 
  : false;

// In drawTask1Node, add red ring for misclassified:
if (isMisclassified) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
    ctx.stroke();
}
```

---

### Fix 2: Environment-Based API URLs

**Step 1: Create API utility**

**File:** `frontend/src/utils/api.js` (create if not exists)
```javascript
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/train';

export { API_BASE, WS_URL };
```

**Step 2: Update imports in each file:**

| File | Change |
|------|--------|
| `useWebSocket.js` | `import { WS_URL } from '../utils/api'` → use `WS_URL` |
| `DataInputView.jsx` | `import { API_BASE } from '../../utils/api'` → use `${API_BASE}/configure` |
| `TrainingControlsV2.jsx` | Use `API_BASE` instead of hardcoded |
| `InductiveDemo.jsx` | Use `API_BASE` instead of hardcoded |
| `ProjectLibrary.jsx` | Use `API_BASE` instead of hardcoded |

---

### Fix 3: Data Upload Validation

**File:** `frontend/src/components/UploadPanel/DataInputView.jsx`

**Add validation function before submit:**
```javascript
const validateData = () => {
  const errors = [];
  const warnings = [];
  
  // Check for duplicate node IDs
  const nodeIds = nodesData.map(n => n[mapping.node_id]);
  const uniqueIds = new Set(nodeIds);
  if (nodeIds.length !== uniqueIds.size) {
    errors.push("Duplicate node IDs found");
  }
  
  // Check edge references
  const validNodeIds = new Set(nodeIds);
  const invalidEdges = edgesData.filter(e => 
    !validNodeIds.has(e[mapping.edge_source]) || 
    !validNodeIds.has(e[mapping.edge_target])
  );
  if (invalidEdges.length > 0) {
    warnings.push(`${invalidEdges.length} edges reference non-existent nodes`);
  }
  
  // Check for non-numeric features
  const nonNumericFeatures = mapping.node_features.filter(col => {
    return nodesData.some(n => isNaN(parseFloat(n[col])));
  });
  if (nonNumericFeatures.length > 0) {
    warnings.push(`Features ${nonNumericFeatures.join(', ')} contain non-numeric values`);
  }
  
  return { errors, warnings };
};
```

---

### Fix 4: Expand CSV Column Detection

**File:** `backend/data/loaders.py`

**Lines 93-107 - Expand keywords:**
```python
for kw_src in ['source', 'src', 'from', 'u', 'node_1', 's', 'node_a', 'id']:
    ...
for kw_tgt in ['target', 'tgt', 'to', 'v', 'node_2', 't', 'node_b']:
    ...
```

---

## ✅ VERIFICATION CHECKLIST

After fixes are applied, verify:

- [ ] Task 1: Can toggle "Errors Only" and see misclassified nodes highlighted
- [ ] Deploy: Can change VITE_API_BASE_URL and have FE connect to different backend
- [ ] Upload: Valid CSV with proper format loads without errors
- [ ] Upload: Invalid data shows clear error messages
- [ ] Task 5: Outlier nodes are visually distinguishable
- [ ] Task 6: Generated graph comparison metrics visible

---

## 📅 RECOMMENDED ROADMAP

| Priority | Fix | Effort | Deadline |
|----------|-----|--------|----------|
| P0 | Task 1 Error Mode | 2h | Immediate |
| P0 | API URLs (env vars) | 1h | Immediate |
| P1 | Upload Validation | 2h | 1 day |
| P1 | CORS Config | 30min | 1 day |
| P2 | Task 5/6 Signals | 4h | 1 week |
| P2 | Schema Versioning | 2h | 1 week |

---

*Report generated: 2026-04-17*
*Project: GNN-Insight*
