# GNN-Insight Testing Strategy

## Purpose

This document defines the minimum verification expected before calling a change
production-ready for the current internal product.

## Testing Layers

### Backend

Use `pytest`.

Primary suites today:

- `backend/tests/test_auth.py`
- `backend/tests/test_governance_routes.py`
- `backend/tests/test_admin_routes.py`
- `backend/tests/test_experiments.py`
- `backend/tests/test_session_crud.py`
- `backend/tests/test_training_service.py`
- `backend/tests/test_ws_protocol.py`
- `backend/tests/test_ws_schemas.py`

Focus areas:

- auth and role enforcement
- project/dataset governance
- experiment replay, compare, report, retention
- session lifecycle and reconnect metadata
- runtime health and strict stack validation
- websocket protocol stability

### Frontend

Use `vitest`.

Current core coverage includes:

- auth-first routing and redirects
- route guards by role
- app route helpers
- session store behavior
- shared primitives and page integration slices
- websocket contract parsing

## TDD Expectations

For backend and frontend product logic:

1. add or extend a failing test first when behavior is changing
2. implement the smallest change that makes the test pass
3. refactor only after the behavior is locked
4. rerun the relevant suite, then broader regression checks

## Required Verification Before Merge

Minimum gates for significant product changes:

- `pytest backend/tests -q`
- `npm test`
- `npm run build`
- `.\scripts\verify_all.ps1` for the Windows local all-in-one verification path
- GitHub Actions workflow: `.github/workflows/ci.yml`

Additional checks when touching contracts or storage:

- update `docs/technical/API_CONTRACT.md`
- update `docs/technical/ARCHITECTURE.md` if lifecycle or ownership changed

Runtime hygiene for tests:

- backend pytest runtime files should default to the OS temp directory via
  `PYTEST_RUNTIME_DIR` instead of writing `.sqlite` and snapshot artifacts into
  the repo tree
- if you need to inspect runtime artifacts locally, point `PYTEST_RUNTIME_DIR`
  at a dedicated scratch folder outside the tracked source tree

## Special Watch-outs

- Do not rely on `backend/scratch/*` as product-quality regression coverage.
- WebSocket changes must preserve the `v3` envelope shape expected by frontend
  contracts.
- Retention changes must verify best runs remain replayable.
- Route changes must preserve:
  - unauthenticated -> `/login`
  - admin -> `/admin/overview`
  - researcher/viewer -> `/app/dashboard`
