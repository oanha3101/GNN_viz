# GNN-Insight Deployment Notes

## Local Development Stack

`docker-compose.yml` provides:

- MySQL
- MongoDB
- Redis
- MinIO
- phpMyAdmin

Default MinIO console:

- API: `http://localhost:9000`
- Console: `http://localhost:9001`
- Username: `minioadmin`
- Password: `minioadmin`

Default phpMyAdmin:

- URL: `http://localhost:8080`
- Host: `mysql`
- Username: `root`
- Password: `root`

## Backend Environment

Common settings:

- `MYSQL_URL`
- `MONGO_URI`
- `REDIS_URL`
- `REQUIRE_RUNTIME_STACK`
- `JWT_SECRET`
- `JWT_EXPIRE_MINUTES`
- `DISABLE_AUTH`

Blob storage settings:

- `BLOB_STORE_PROVIDER=local|minio`
- `LOCAL_BLOB_ROOT`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_SECURE=0|1`

Recommended local MinIO values:

```env
BLOB_STORE_PROVIDER=minio
S3_ENDPOINT=127.0.0.1:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=gnn-insight
S3_SECURE=0
```

Quick runtime verification:

```powershell
.\scripts\check_runtime.ps1
```

Runtime strictness:

- `REQUIRE_RUNTIME_STACK=0`
  - local dev can still boot in degraded mode and expose health details
- `REQUIRE_RUNTIME_STACK=1`
  - backend fails fast on startup if MySQL falls back or Mongo/Redis are unavailable

## Frontend Environment

- `VITE_API_BASE_URL`
- `VITE_WS_URL`
- `VITE_EXPERIMENT_HUB_V1`

Example:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws/train
VITE_EXPERIMENT_HUB_V1=1
```

## Deployment Guidance

- Keep MySQL as the metadata source of truth.
- Keep MongoDB for replay payloads and metrics.
- Use Redis only for disposable cache or transient runtime state.
- Prefer MinIO locally and S3-compatible storage in production-like setups.
- Do not point the main product flow at hard-coded local dataset paths.

## MySQL Schema Sync

`backend/database.py` currently creates missing tables, but it does not upgrade
older MySQL tables in place. For schema upgrades, use:

- SQL file: `backend/sql/mysql_schema_sync.sql`

Example local command for the default Docker Compose MySQL:

```powershell
Get-Content backend/sql/mysql_schema_sync.sql -Raw | mysql -h 127.0.0.1 -P 3344 -u root -proot gnn_db
```

If you already configured `MYSQL_URL` differently, point the command at that
database instead.

Recommended safety steps before running:

1. Backup the current MySQL database.
2. Verify there are no orphan rows that would block foreign-key creation.
3. Run the schema sync.
4. Restart the backend and smoke test auth, projects, datasets, sessions, and experiments.

If the database came from an older branch and now contains duplicate legacy
foreign keys or indexes, run this cleanup once after schema sync:

```powershell
Get-Content backend/sql/mysql_schema_cleanup_legacy_constraints.sql -Raw | mysql -h 127.0.0.1 -P 3344 -u root -proot gnn_db
```

## Smoke Checks After Boot

1. `GET /api/auth/me` behaves as expected for the auth mode.
2. `GET /api/health` reports `status=ok` for the Docker-first stack.
3. `POST /api/sessions` returns `ws_url=/ws/train`.
4. A training run creates session metadata and replay snapshots.
5. `GET /api/experiments`
   returns the list contract with `items`, `total`, `page`, `page_size`.
6. Admin retention dry-run returns a safe preview.
7. `.\scripts\verify_all.ps1` passes on a local Windows checkout.
