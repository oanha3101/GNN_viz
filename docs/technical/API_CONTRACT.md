# GNN-Insight API Contract

## Purpose

This document keeps frontend and backend aligned on the public API shapes that
drive the product shell, governance pages, experiment hub, and admin console.
If an API shape changes, update this file in the same change.

## List Response Contract

All page-facing list endpoints should return this shape:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 0
}
```

### Rules

- `items` is always an array.
- `total` is the total number of matching records before any future paging UI.
- `page` defaults to `1` for the current internal workspace flow.
- `page_size` is the number of items returned in the payload.

## Current Standardized List Routes

- `GET /api/projects`
- `GET /api/datasets`
- `GET /api/experiments`
- `GET /api/admin/users`
- `GET /api/admin/datasets`
- `GET /api/admin/experiments`
- `GET /api/admin/sessions`
- `GET /api/admin/audit-logs`

### Experiment list filters

`GET /api/experiments` currently supports these query params:

- `project_id`
- `dataset_version_id`
- `task_type`
- `model_type`
- `owner_id`
- `status`
- `q` for lightweight text search over title, dataset name, and model type

## Detail and Action Routes

- Detail routes return one domain object, not a list wrapper.
- Action routes return either:
  - the updated domain object, or
  - a compact action payload such as `{ "status": "deleted", "id": 123 }`

## Runtime and Health Routes

### `GET /api/health`

```json
{
  "status": "ok",
  "runtime": {
    "strict_runtime_stack": false,
    "mysql": {
      "configured_url": "mysql+pymysql://root:root@127.0.0.1:3344/gnn_db",
      "engine_url": "mysql+pymysql://root:***@127.0.0.1:3344/gnn_db",
      "available": true,
      "fallback_active": false,
      "driver": "mysql"
    },
    "mongo": {
      "configured_url": "mongodb://admin:password@127.0.0.1:27017/",
      "available": true,
      "fallback_active": false
    },
    "redis": {
      "configured_url": "redis://127.0.0.1:6379/0",
      "available": true,
      "fallback_active": false
    },
    "blob": {
      "provider": "minio",
      "root_dir": null,
      "bucket": "gnn-insight",
      "configured_endpoint": "127.0.0.1:9000",
      "available": true,
      "fallback_active": false,
      "strict_ready": true,
      "error": null
    }
  },
  "degraded_services": []
}
```

Rules:

- `status = "ok"` when MySQL, MongoDB, and Redis are all online.
- `status = "degraded"` when one or more runtime services are unavailable or a fallback is active.
- in strict mode (`REQUIRE_RUNTIME_STACK=1`), startup should fail before this endpoint is exposed if the required stack is degraded.

## Runtime Dataset Configuration Routes

### `POST /api/configure` and `POST /api/upload-files`

These routes return a training-ready artifact pointer for custom dataset flows.

```json
{
  "status": "success",
  "metadata": {
    "task": 1,
    "num_nodes": 24,
    "num_edges": 48,
    "schema_version": "2.0"
  },
  "graph_json": {},
  "uploaded_file_path": "datasets/runtime/custom-dataset/4bf4d4cc3d9346e5a9309001d35fc9c6.pt",
  "dataset_name": "custom-dataset",
  "validation_warnings": [],
  "task_config": {}
}
```

Rules:

- `uploaded_file_path` is now the blob-backed runtime object key for the processed
  training artifact, not a product contract that assumes a local filesystem path.
- When a companion graph JSON is stored, it lives beside the artifact using
  `${uploaded_file_path}.json`.
- Frontend may still keep the legacy field name for compatibility, but product-like
  flows should treat it as an object reference that survives process restarts.

### `POST /api/upload-graph`

```json
{
  "num_nodes": 3,
  "num_edges": 4,
  "uploaded_file_path": "datasets/runtime/runtime-graph/5c2d8d3b8b8048fba8c1f7de4fa6a7ec.json",
  "blob_key": "datasets/runtime/runtime-graph/5c2d8d3b8b8048fba8c1f7de4fa6a7ec.json",
  "filename": "runtime-graph.json"
}
```

Rules:

- This route must not expose a local temporary filesystem path in product-like flows.
- `uploaded_file_path` and `blob_key` point to the same runtime artifact in blob storage.

## Current Detail Route Shapes

### `GET /api/datasets/{dataset_id}`

```json
{
  "dataset": {
    "id": 1,
    "name": "Cora",
    "slug": "cora",
    "description": "Citation graph",
    "owner_id": 2,
    "is_public": false,
    "current_version_id": 4,
    "created_at": "2026-05-04T10:00:00+00:00"
  },
  "versions": [
    {
      "id": 4,
      "dataset_id": 1,
      "version": 2,
      "lifecycle": "published",
      "schema_version": "2.0",
      "summary_json": {},
      "validation_json": {},
      "source_files_json": {},
      "raw_blob_key": "datasets/raw/cora-v2.zip",
      "processed_blob_key": "datasets/processed/cora-v2.pt",
      "created_by": 2,
      "published_by": 1,
      "created_at": "2026-05-04T10:00:00+00:00",
      "published_at": "2026-05-04T10:30:00+00:00"
    }
  ]
}
```

Rule:

- `uploaded_file_path` should be treated as a resumable artifact reference. It may
  look path-like, but the backend can resolve it from blob storage even when the
  original local temp file no longer exists.

### `GET /api/admin/summary`

```json
{
  "users": 12,
  "projects": 5,
  "datasets": 8,
  "dataset_versions": 14,
  "experiments": 48,
  "training_sessions": 9,
  "active_sessions": 2,
  "failed_sessions_recent": 1,
  "retention_compacted_runs": 7,
  "recent_audit_events": 14,
  "blob_provider": "local",
  "blob_object_count": 6,
  "blob_orphan_count": 1,
  "mongo_available": true,
  "redis_available": true,
  "admin_user": {
    "id": 1,
    "email": "admin@example.com",
    "username": "admin",
    "full_name": "Admin",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-05-04T10:00:00+00:00"
  }
}
```

### `GET /api/sessions/{session_id}/resume`

```json
{
  "session_id": "uuid",
  "task_type": 3,
  "model_type": "GAT",
  "dataset_name": "resume_graph",
  "project_id": 77,
  "project_title": "Graph Bench",
  "dataset_id": 12,
  "dataset_version_id": 88,
  "dataset_version_name": "resume_graph v2",
  "config": {
    "epochs": 9,
    "lr": 0.03,
    "hidden": 24,
    "dropout": 0.4,
    "heads": 2
  },
  "task_config": {
    "edge_split_ratio": 0.15
  },
  "uploaded_file_path": "datasets/runtime/resume-graph.pt",
  "upload_metadata": {
    "num_nodes": 24,
    "num_edges": 48
  },
  "ws_url": "/ws/train",
  "last_epoch": 2,
  "last_seq": 11,
  "status": "running",
  "experiment_id": 101,
  "report_path": "/api/experiments/101/report",
  "replay_path": "/api/experiments/101/replay?epoch=2",
  "snapshot_count": 3,
  "snapshots": [
    { "epoch": 0 },
    { "epoch": 1 },
    { "epoch": 2 }
  ]
}
```

### `GET /api/experiments/{id}`

```json
{
  "id": 101,
  "title": "Baseline run",
  "project_id": 10,
  "owner_id": 2,
  "dataset_id": 4,
  "dataset_version_id": 9,
  "task_type": 1,
  "model_type": "GCN",
  "dataset_name": "cora",
  "epoch_count": 4,
  "accuracy": 0.91,
  "loss": 0.11,
  "best_epoch": 3,
  "status": "completed",
  "is_best": true,
  "is_mock": false,
  "retention_state": "full",
  "created_at": "2026-05-05T00:00:00+00:00",
  "learning_rate": 0.01,
  "hidden_dim": 64,
  "dropout": 0.5,
  "config_json": {},
  "graph_payload": {},
  "snapshots_json": [],
  "metrics_json": {},
  "notes": "Candidate baseline"
}
```

## Current Action Route Shapes

### Auth

- `POST /api/auth/register` returns:
  - `{ "access_token": "...", "token_type": "bearer", "user": { ... } }`
- `POST /api/auth/login` returns:
  - `{ "access_token": "...", "token_type": "bearer", "user": { ... } }`
- `GET /api/auth/me` returns:
  - one `user` object when auth is enabled
  - `{ "id": null, "username": "anonymous", "message": "Auth disabled" }` in dev auth-disabled mode

### Dataset lifecycle

- `POST /api/datasets` returns:
  - `{ "dataset": { ... }, "version": { ... } }`
- `POST /api/datasets/{dataset_id}/versions` returns:
  - one `dataset version` object
- `POST /api/datasets/{dataset_id}/publish?version_id=...` returns:
  - one `dataset version` object with `lifecycle = "published"`
- `POST /api/datasets/{dataset_id}/deprecate?version_id=...` returns:
  - one `dataset version` object with `lifecycle = "deprecated"`

### Admin actions

- `PATCH /api/admin/users/{user_id}/role` returns:
  - one `user` object with the updated `role`
- `POST /api/admin/sessions/{session_id}/stop` returns:
  - one `training session` object with updated `status`
- `POST /api/admin/sessions/{session_id}/retry` returns:
  - a session action payload from session manager, currently including `session_id`, `status`, and connection metadata when available
- `POST /api/admin/retention?dry_run=true|false` returns:
  - `{ "results": [], "dry_run": true }`
- `POST /api/admin/blob-cleanup?dry_run=true|false` returns:
  - `{ "provider": "local", "dry_run": true, "orphan_keys": [], "deleted_keys": [], "object_count": 0, "orphan_count": 0, "deleted_count": 0 }`
  - real runs (`dry_run=false`) also create one `audit_logs` entry with `action = "retention_purged"` and `target_type = "blob_store"`
  - runtime artifacts still referenced by `dataset_versions` or `training_sessions.config_json.uploaded_file_path` must not appear in `orphan_keys`

### Session actions

- `POST /api/sessions` returns:
  - `{ "session_id": "uuid", "ws_url": "/ws/train", "status": "pending" }`
- Live WebSocket training then sends one JSON config payload to `/ws/train`:
  - must include `auth_token` when auth is enabled
  - may include `session_id`, `project_id`, `dataset_version_id`, and `uploaded_file_path`
- `PATCH /api/sessions/{session_id}` returns:
  - `{ "session_id": "uuid", "status": "running" }`
- `POST /api/sessions/{session_id}/stop` returns:
  - `{ "session_id": "uuid", "status": "stopped" }`
- Legacy `POST /api/stop` is no longer part of the product flow; current backend tests verify the old route returns `404` or `405` if called

### Experiment actions

- `POST /api/experiments` returns:
  - `{ "id": 101, "status": "saved", "experiment_status": "completed", "session_id": "uuid", "mongo_run_id": "101", "graph_payload_id": "...", "snapshot_count": 4, "report_path": "/api/experiments/101/report", "replay_path": "/api/experiments/101/replay?epoch=3" }`
- `POST /api/experiments/{id}/replay?epoch=...` returns:
  - one replay payload with `experiment_id`, `graph_payload`, `best_epoch`, and either `snapshots` or one `snapshot`
- `POST /api/experiments/compare` returns:
  - `{ "results": [{ "experiment": { ... }, "metrics": { ... } }] }`
- `PATCH /api/experiments/{id}` returns:
  - one `experiment detail` object
  - when `is_best = true`, backend enforces one best run per project by clearing
    the previous pinned run in that same project
- `GET /api/experiments/{id}/report` returns:
  - one report payload with `experiment`, `summary`, `config`, `metrics`, `dataset_version`, `replay`, `notes`, `next_action`
- `DELETE /api/experiments/{id}` returns:
  - `{ "status": "deleted", "id": 101 }`
- `POST /api/experiments/bulk-delete` requires an authenticated admin user when
  auth is enabled and returns:
  - `{ "status": "bulk_deleted", "deleted": [101], "not_found": [999] }`

### Visualization snapshot fields

- Task 2 graph classification snapshots include `model_type`; `SAGE`,
  `GRAPHSAGE`, and `GRAPH_SAGE` select the GraphSAGE encoder.
- Task 5 graph embedding snapshots may send:
  - `per_node_knn_preservation` as `{ "0": 0.8, "1": 0.6 }`
  - `outlier_scores` as rows like `{ "node_id": 7, "avg_distance_to_neighbors": 0.9, "is_outlier": true }`
- Task 6 graph generation snapshots should keep a stable string `signature` on
  each generated graph when possible. The frontend computes a fallback signature
  from `nodes` and `links` for older payloads.

## Frontend Compatibility Note

- Frontend pages may temporarily keep a defensive adapter for older array-only
  payloads during rollout.
- New backend work should target the standardized list contract above, not the
  legacy bare-array shape.
