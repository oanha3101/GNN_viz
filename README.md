# GNN-Insight — Graph Neural Network Training Visualizer

An interactive web application that visualizes how GNNs learn — epoch by epoch — like a video player.

## Quick Start

### Frontend (Mock Mode — no backend needed)
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
# Click [Mock Mode] → [Start Training] → [▶ Play]
```

### Backend (Live Mode — real model training)
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Features
- **6 Tasks**: Node Classification, Graph Classification, Link Prediction, Community Detection, Graph Embedding, Graph Generation
- **3 Models**: GCN, GAT (with attention maps), GraphSAGE
- **Video Player**: Play/pause/scrub through training epochs
- **Mock Mode**: Full offline demo without backend
- **Keyboard Shortcuts**: Space (play/pause), ←→ (step), Shift+←→ (jump 10)
