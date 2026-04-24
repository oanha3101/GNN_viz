# AI Agent Prompt: GNN-Insight Bug Investigation & Fix

You are a senior full-stack developer tasked with fixing bugs in the GNN-Insight project. 

## Project Context
- **Frontend**: React + Vite + Zustand
- **Backend**: FastAPI + PyTorch Geometric
- **Purpose**: GNN visualization and training platform

## Your Mission

Read the `BUG_REPORT.md` file in the current directory. For each bug listed:

1. **Investigate** - Read the relevant source files to understand the issue
2. **Implement Fix** - Write code changes to resolve the bug
3. **Verify** - Ensure the fix is consistent with the codebase patterns

## Bugs to Fix (Priority Order)

### P0 - CRITICAL

1. **Task 1 Error Mode Disabled**
   - File: `frontend/src/components/TopologyView/TopologyView.jsx`
   - Lines: 47-48, 185-265
   - Issue: `showErrorsOnlySafe = false` hardcoded, preventing error visualization
   - Fix: Use state variable, add node correctness highlighting

2. **Hardcoded API URLs**
   - Files to fix:
     - `frontend/src/hooks/useWebSocket.js` (line 46)
     - `frontend/src/components/UploadPanel/DataInputView.jsx` (line 141)
     - `frontend/src/components/TrainingControlsV2.jsx` (line 14)
     - `frontend/src/components/TopologyView/InductiveDemo.jsx` (line 35)
     - `frontend/src/components/Library/ProjectLibrary.jsx` (line 11)
   - Issue: All URLs hardcoded to `localhost:8000`
   - Fix: Create `frontend/src/utils/api.js` with environment-based constants

### P1 - MEDIUM

3. **Data Upload Validation**
   - File: `frontend/src/components/UploadPanel/DataInputView.jsx`
   - Issue: No validation before upload, silent failures
   - Fix: Add validation function checking node IDs, edge references, feature types

4. **CSV Column Auto-Detection**
   - File: `backend/data/loaders.py` (lines 93-107)
   - Issue: Limited keywords for source/target columns
   - Fix: Expand keyword list

5. **CORS Configuration**
   - File: `backend/main.py` (lines 47-53)
   - Issue: Only allows port 5173
   - Fix: Use environment variable or allow all origins in dev

### P2 - ENHANCEMENTS (Optional)

6. **Task 5/6 Insights** - Add visualization for outlier_scores and comparison_metrics
7. **Schema Versioning** - Add version field to epoch snapshots

## Important Rules

1. **Code Style**: Match existing code conventions in each file
2. **No New Files Unless Necessary**: Reuse existing utilities
3. **Test After Fix**: Run linter/typecheck if available (check package.json)
4. **Commit**: Do NOT commit changes unless explicitly asked

## Output Format

After investigating and fixing each bug, report:
- Bug number and name
- Files modified
- Changes made (summary)
- Verification status

Good luck!
