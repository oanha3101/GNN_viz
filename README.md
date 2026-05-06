# GNN-Insight

An internal product for training, replaying, and governing Graph Neural Network
experiments with an auth-first product shell, hybrid persistence, and rich
visual analysis.

## Quick Start

### 1. Start the local stack

From the repo root:

```powershell
docker-compose up -d
```

This starts:

- MySQL on `127.0.0.1:3344`
- MongoDB on `127.0.0.1:27017`
- Redis on `127.0.0.1:6379`
- MinIO API on `127.0.0.1:9000`
- MinIO console on `http://127.0.0.1:9001`
- phpMyAdmin on `http://127.0.0.1:8080`

### 2. Install backend dependencies

```powershell
cd backend
python -m pip install -r requirements.txt
```

### 3. Run the backend

```powershell
cd backend
python main.py
```

The backend listens on `http://127.0.0.1:8000`.

### 4. Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend listens on `http://127.0.0.1:5173`.

### 5. Verify the repo

```powershell
.\scripts\verify_all.ps1
```

### 6. Check the runtime stack

```powershell
.\scripts\check_runtime.ps1
```

## Product Routes

- Public auth: `/login`, `/register`
- Researcher or viewer shell: `/app/*`
- Admin shell: `/admin/*`

The product no longer treats the Lab as a public entry point. Login comes
first, then users are routed to the correct shell by role.

## Core Capabilities

- Auth-first experience with separate app and admin shells
- Project and dataset governance
- Training sessions with replay and compare flows
- Hybrid persistence:
  - MySQL for metadata and governance
  - MongoDB for replay snapshots and detailed metrics
  - MinIO or S3-compatible blob storage for large artifacts
- Mock Mode for fast internal UI testing

## Documentation

- [Project Overview](docs/technical/PROJECT_OVERVIEW.md)
- [Architecture](docs/technical/ARCHITECTURE.md)
- [API Contract](docs/technical/API_CONTRACT.md)
- [Testing Strategy](docs/technical/TESTING_STRATEGY.md)
- [Deployment Notes](docs/technical/DEPLOYMENT.md)
