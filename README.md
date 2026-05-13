# GNN-Insight

GNN-Insight is an internal platform for training, replaying, comparing, and
governing Graph Neural Network experiments. The product supports six GNN tasks,
GraphSAGE/GCN/GAT model selection where applicable, WebSocket epoch streaming,
and rich visual diagnostics for model behavior.

## Quick Start

Start the local services from the repository root:

```powershell
docker-compose up -d
```

Install and run the backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python main.py
```

Install and run the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Default local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- MySQL: `127.0.0.1:3344`
- MongoDB: `127.0.0.1:27017`
- Redis: `127.0.0.1:6379`
- MinIO console: `http://127.0.0.1:9001`
- phpMyAdmin: `http://127.0.0.1:8080`

Run the full local verification:

```powershell
.\scripts\verify_all.ps1
```

Check service health:

```powershell
.\scripts\check_runtime.ps1
```

## Product Routes

- Public auth: `/login`, `/register`
- Researcher or viewer shell: `/app/*`
- Admin shell: `/admin/*`

The product is auth-first. Users sign in before entering the research or admin
shells.

## Core Capabilities

- Six task workflows: node classification, graph classification, link
  prediction, community detection, graph embedding, and graph generation.
- GraphSAGE/GCN/GAT training where the task has a trainable GNN encoder.
- WebSocket training stream: `graph_data` then `epoch_snapshot` then
  `training_complete`.
- Replay, compare-runs, reports, retention, and admin governance.
- Hybrid persistence:
  - MySQL for metadata and governance.
  - MongoDB or local fallback for replay snapshots and metrics.
  - MinIO or S3-compatible storage for large artifacts.

## Documentation

- [Project Overview](docs/technical/PROJECT_OVERVIEW.md)
- [Architecture](docs/technical/ARCHITECTURE.md)
- [API Contract](docs/technical/API_CONTRACT.md)
- [Frontend Structure](docs/technical/FRONTEND_STRUCTURE.md)
- [Testing Strategy](docs/technical/TESTING_STRATEGY.md)
- [Deployment Notes](docs/technical/DEPLOYMENT.md)
- [Visualization Guide](docs/user/VISUALIZATION_GUIDE.md)
- [Dataset Mapping Guide](docs/user/DATASET_MAPPING_GUIDE.md)
