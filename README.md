# GNN-Insight — Graph Neural Network Training Visualizer

An interactive web application that visualizes how GNNs learn — epoch by epoch — like a video player.

## Quick Start

### 1. Infrastructure (Docker)
Ensure Docker/Colima is running.
```bash
docker-compose up -d
# Runs MySQL (3344), MongoDB (27017), Redis (6379)
```

### 2. Launch Unified (FE + BE)
```bash
./start_all.sh
# Automated: environment setup, venv activation, FE+BE startup.
```

### Manual Launch
- **Frontend**: `cd frontend && npm install && npm run dev`
- **Backend**: `cd backend && source venv/bin/activate && python3 main.py`

## Project Documentation
All documentation is now organized in the `docs/` folder:
- **`docs/user/`**: [Dataset Mapping Guide](docs/user/DATASET_MAPPING_GUIDE.md), Visualization tips.
- **`docs/technical/`**: [Project Overview](docs/technical/PROJECT_OVERVIEW.md), Architecture details.
- **`docs/roadmap/`**: Progress tracker and future plans.


## Features
- **6 Tasks**: Node Classification, Graph Classification, Link Prediction, Community Detection, Graph Embedding, Graph Generation
- **3 Models**: GCN, GAT (with attention maps), GraphSAGE
- **Video Player**: Play/pause/scrub through training epochs
- **Mock Mode**: Full offline demo without backend
- **Keyboard Shortcuts**: Space (play/pause), ←→ (step), Shift+←→ (jump 10)
