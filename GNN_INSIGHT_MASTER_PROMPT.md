# ╔══════════════════════════════════════════════════════════════════════════╗
# ║          MASTER PROMPT – GNN-INSIGHT VISUALIZATION DEMO                 ║
# ║  Dùng nguyên văn prompt này paste vào Claude / Cursor / Copilot Chat    ║
# ╚══════════════════════════════════════════════════════════════════════════╝

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHẦN A – PROMPT GỬI CHO AI ĐỂ BUILD TOÀN BỘ PROJECT
# (Copy từ dòng "You are..." đến hết phần A rồi paste vào AI)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""
You are a senior full-stack engineer specializing in data visualization and
machine learning. Build me a complete, production-ready web demo called
GNN-Insight — a Graph Neural Network training visualizer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GNN-Insight is an interactive web application that visualizes how Graph Neural
Networks learn — epoch by epoch — like a video player. Each epoch produces one
"frame" showing the current state of the graph (node colors, edge weights,
embeddings, metrics). The user can play/pause/scrub through all 100–200 frames
exactly like a video timeline.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TECH STACK (strict — do not deviate)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FRONTEND (folder: /frontend)
  - React 18 + Vite 5
  - Tailwind CSS 3
  - react-force-graph-2d  → Topology View (node-edge animation)
  - Plotly.js             → Embedding Space (2D scatter)
  - Recharts              → Metrics Chart (Loss/Accuracy lines)
  - Framer Motion         → smooth UI transitions
  - Zustand               → global state (epoch index, playing state)

BACKEND (folder: /backend)
  - Python 3.11
  - FastAPI + uvicorn
  - PyTorch 2.x + torch_geometric (PyG)
  - scikit-learn          → PCA for embedding reduction
  - networkx              → graph utilities
  - WebSocket endpoint    → stream epoch data to frontend

DATA
  - Built-in: Cora dataset (loaded via PyG's Planetoid)
  - Custom: user uploads CSV (nodes.csv + edges.csv)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CORE FEATURE: EPOCH ANIMATION (VIDEO-LIKE PLAYBACK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the most important feature. Implement it exactly as described:

### Data Flow per Epoch
After each training epoch, the backend captures:
  - node_predictions: array[N]          — predicted class for each node
  - node_colors: array[N] of hex        — color mapped from class
  - embeddings_2d: array[N][2]          — PCA-reduced to 2D
  - attention_weights: array[E] | null  — only for GAT model
  - train_loss: float
  - val_loss: float
  - train_acc: float
  - val_acc: float
  - epoch: int

All epoch snapshots are stored in backend memory as:
  epoch_snapshots: List[EpochSnapshot]  — one per epoch, 0 to max_epochs

### Frontend Playback System
Build a VIDEO PLAYER component (EpochPlayer) with:

  [|◄] [◄] [▶/⏸] [►] [►|]   Speed: [0.5x] [1x] [2x] [4x]
  ════════════════●══════════════════════════════  Epoch: 47 / 100
  ▲ scrubber bar — click/drag anywhere to jump to that epoch

When playing:
  - Advance epoch index every (1000 / speed) ms using setInterval
  - Each tick: read epoch_snapshots[currentEpoch] and update all 3 views
  - Animate node color transitions with 200ms CSS transition
  - Animate scatter point positions with Plotly's animation frames
  - Append new point to Recharts line (slice data up to currentEpoch)

When scrubbing (drag on timeline):
  - Instantly jump to target epoch snapshot
  - Update all 3 views synchronously

Key state (Zustand store):
  currentEpoch: number       — which snapshot is being shown
  isPlaying: boolean         — playback running?
  playbackSpeed: number      — 0.5 | 1 | 2 | 4
  snapshots: EpochSnapshot[] — all captured data
  totalEpochs: number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 6 TASKS — IMPLEMENT ALL WITH SELECTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add a task selector at the top: [Task 1] [Task 2] [Task 3] [Task 4] [Task 5] [Task 6]
Each task changes what is visualized. Implement all 6:

─────────────────────────────────────────
TASK 1 — NODE CLASSIFICATION
─────────────────────────────────────────
Dataset: Cora (or user CSV)
Target: predict node label (7 classes)

Topology View:
  - Each node is a colored circle (color = predicted class this epoch)
  - Node size = degree (higher degree = larger circle)
  - On hover: show node ID, ground truth label, predicted label, softmax probs
  - Toggle button: "Prediction Mode" vs "Error Mode"
    * Error Mode: correct nodes = green, wrong nodes = red
  - Nodes in train set have white border ring

Embedding Space:
  - 2D PCA scatter of hidden layer embeddings
  - Color = predicted class
  - Animate point positions between epochs (smooth transition)
  - Show Silhouette Score badge (updates each epoch)
  - On hover: node ID and labels

Metrics Chart:
  - 4 lines: train_loss (red), val_loss (orange), train_acc (green), val_acc (blue)
  - Vertical dashed line at best val_acc epoch (auto-detected)
  - X-axis = epoch number, updates as animation plays

─────────────────────────────────────────
TASK 2 — GRAPH CLASSIFICATION
─────────────────────────────────────────
Dataset: Generate 50 mini synthetic graphs (25 class-0, 25 class-1)
  - Class 0: random Erdos-Renyi graphs, ~10 nodes
  - Class 1: random scale-free graphs, ~10 nodes
Target: predict class of each graph

Topology View:
  - Show a 5×10 grid of mini graph thumbnails (50 cells)
  - Each cell renders its graph using react-force-graph-2d in miniature
  - Cell border: GREEN if predicted correctly, RED if wrong
  - Border thickness = model confidence (thick = confident)
  - Click cell → expand to full-size view with node contribution heatmap
    (node color intensity = how much it contributes to readout)

Embedding Space:
  - Each point = one GRAPH (not one node)
  - Color = predicted class of that graph
  - Points animate between epochs

Metrics Chart:
  - Same 4 lines as Task 1

─────────────────────────────────────────
TASK 3 — LINK PREDICTION
─────────────────────────────────────────
Dataset: Cora — hide 20% of edges as positive test set, sample equal negative edges
Target: predict if a link exists between two nodes

Topology View:
  - Node colors = node class (fixed, from ground truth)
  - EDGE colors change each epoch based on link prediction score:
    * Score > 0.7 → RED (confident: link exists)
    * Score 0.3–0.7 → YELLOW (uncertain)
    * Score < 0.3 → GRAY transparent (confident: no link)
  - Predicted-but-not-real edges shown as DASHED lines in orange
  - Toggle: show/hide "future predicted links" (dashed)

Embedding Space:
  - Show node embeddings as 2D scatter (color = node class)
  - Draw faint lines between node pairs with high link score
  - Lines fade in as score increases across epochs

Metrics Chart:
  - Lines: train_loss, AUC-ROC, Average Precision (AP)
  - AUC shown as large number badge in top corner

─────────────────────────────────────────
TASK 4 — COMMUNITY DETECTION
─────────────────────────────────────────
Dataset: Synthetic community graph (use networkx.generators.community.LFR_benchmark_graph
or fallback: manually create 4 communities of 30 nodes each)
Target: unsupervised — find communities without labels

Topology View:
  - Use FORCE-DIRECTED layout that physically separates communities
    (set charge/repulsion high between different clusters)
  - Node color = community ID assigned by model this epoch
  - Node border WHITE + thick = "bridge node" (connected to 2+ communities)
  - Intra-community edges: THICK and colored matching community
  - Inter-community edges: THIN gray
  - The graph should visually "split into islands" as epochs progress

Metrics Chart:
  - Show Modularity Q score (not loss/accuracy)
  - Show Conductance score
  - Both update each epoch

Hierarchy Panel (additional):
  - Simple dendrogram showing community merging/splitting tree
  - Slider to choose number of communities K (2–10)
  - Changing K re-colors topology view instantly

─────────────────────────────────────────
TASK 5 — GRAPH EMBEDDING
─────────────────────────────────────────
Dataset: Cora
Target: learn high-quality node embeddings (no explicit classification target)
Train with: reconstruction loss (Graph Autoencoder — reconstruct adjacency)

Topology View:
  - Edge color = embedding proximity:
    * DARK BLUE: two nodes close in embedding space (should be connected)
    * RED: two nodes far in embedding space (but connected — bad!)
  - Nodes colored by ground truth class (fixed)
  - Goal: watch RED edges turn BLUE as model learns

Embedding Space (PRIMARY VIEW — make it largest):
  - Show BOTH t-SNE and PCA side by side with toggle
  - Animate point positions each epoch
  - Show "Structure Preservation %" badge
    (% of node's 5 nearest graph-neighbors also in top-5 embedding-neighbors)

Metrics Chart:
  - Lines: Reconstruction Loss, Structure Preservation %, Link Pred AUC

─────────────────────────────────────────
TASK 6 — GRAPH GENERATION
─────────────────────────────────────────
Dataset: 100 small synthetic graphs (training set)
Model: Simple Graph VAE (encoder = GCN, decoder = inner product)
Target: learn to generate new valid graphs

Generation Preview Panel (PRIMARY VIEW):
  - After each epoch, sample 6 graphs from the latent space
  - Display them as a 2×3 grid of mini graphs
  - Each mini graph shows the generated structure
  - Label each: "Valid ✓" or "Invalid ✗" (check: connected, no self-loops)
  - Animate nodes appearing one by one (build-up animation per graph)

Latent Space View (replaces Embedding Space):
  - Each point = one training graph encoded to 2D latent z
  - Show a SAMPLE REGION circle (radius = 1 sigma of prior N(0,1))
  - New generated points appear at sampled z locations each epoch
  - Drag a point → decode it → show generated graph in preview

Metrics Chart:
  - Lines: Reconstruction Loss, KL Divergence, Valid %

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 3 MODELS — IMPLEMENT ALL WITH SELECTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model selector: [GCN] [GAT] [GraphSAGE]
Switching model resets training and clears snapshots.

─────────────────────────────────────────
GCN (Graph Convolutional Network)
─────────────────────────────────────────
Architecture:
  class GCN(torch.nn.Module):
      def __init__(self, in_channels, hidden_channels, out_channels):
          super().__init__()
          self.conv1 = GCNConv(in_channels, hidden_channels)
          self.conv2 = GCNConv(hidden_channels, out_channels)

      def forward(self, x, edge_index):
          x = self.conv1(x, edge_index).relu()
          x = F.dropout(x, p=0.5, training=self.training)
          embedding = x  # ← capture this for visualization
          x = self.conv2(x, edge_index)
          return x, embedding

Visualization specifics:
  - All edges same thickness and color (no attention)
  - Embedding View: clusters tend to be round/spherical
  - Loss curve: smoothest of the 3 models

─────────────────────────────────────────
GAT (Graph Attention Network)
─────────────────────────────────────────
Architecture:
  class GAT(torch.nn.Module):
      def __init__(self, in_channels, hidden_channels, out_channels, heads=4):
          super().__init__()
          self.conv1 = GATConv(in_channels, hidden_channels, heads=heads,
                               dropout=0.6, return_attention_weights=True... 
                               # use add_self_loops=True)
          self.conv2 = GATConv(hidden_channels * heads, out_channels, heads=1,
                               concat=False, dropout=0.6)

      def forward(self, x, edge_index):
          x, (edge_index_att, alpha) = self.conv1(x, edge_index,
                                                   return_attention_weights=True)
          attention_weights = alpha.mean(dim=1)  # average over heads
          # ... rest of forward
          return x, embedding, attention_weights

Visualization specifics — ATTENTION MAP:
  - Edge THICKNESS = attention_weight value (normalize 0→1 to 1px→6px)
  - Edge COLOR gradient: low attention = gray (#BBBBBB), high = vivid blue (#1565C0)
  - "Head Selector" toggle: [Head 1] [Head 2] [Head 3] [Head 4] [Avg]
    (show attention weights of individual heads or their average)
  - Node info panel (on click): show top-5 neighbors sorted by attention weight
  - When scrubbing timeline: watch edges pulse thicker/thinner as attention evolves

─────────────────────────────────────────
GraphSAGE (Sample & Aggregate)
─────────────────────────────────────────
Architecture:
  class SAGE(torch.nn.Module):
      def __init__(self, in_channels, hidden_channels, out_channels):
          super().__init__()
          self.conv1 = SAGEConv(in_channels, hidden_channels)
          self.conv2 = SAGEConv(hidden_channels, out_channels)

Visualization specifics:
  - Edge thickness: uniform (no attention)
  - Show NOISE INDICATOR badge: "High variance epoch" if loss changes > threshold
  - "Add New Node" button: user inputs feature vector → model predicts class
    INSTANTLY (inductive property demo) — show new node appear with predicted color
  - Loss curve: most jagged/noisy of the 3 models
  - Label this in UI: "⚠ Normal: GraphSAGE uses random sampling → higher variance"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## UI LAYOUT (implement exactly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────────────┐
│  GNN-INSIGHT                            [Task 1▼] [GCN▼]  [⚙ Config]  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │                               │  │                                 │ │
│  │      TOPOLOGY VIEW            │  │     EMBEDDING SPACE             │ │
│  │   (react-force-graph-2d)      │  │        (Plotly.js)              │ │
│  │                               │  │                                 │ │
│  │         60% width             │  │         40% width               │ │
│  │         50% height            │  │         50% height              │ │
│  └───────────────────────────────┘  └─────────────────────────────────┘ │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │                               │  │  NODE INFO PANEL                │ │
│  │      METRICS CHART            │  │  (appears on node click)        │ │
│  │       (Recharts)              │  │  - Node ID, Class, Predicted    │ │
│  │                               │  │  - Softmax probabilities bar    │ │
│  │         60% width             │  │  - Top-5 attention neighbors    │ │
│  │         50% height            │  │    (GAT only)                   │ │
│  └───────────────────────────────┘  └─────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│  EPOCH PLAYER:                                                          │
│  [|◄] [◄] [▶] [►] [►|]   [0.5x][1x][2x][4x]   Epoch: 47 / 100       │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░              │
│  0                                                         100          │
├─────────────────────────────────────────────────────────────────────────┤
│  [▶ Start Training]  Epochs: [100]  LR: [0.01]  Hidden: [64]          │
│  Status: Training... Epoch 47/100  ETA: 23s                [■ Stop]    │
└─────────────────────────────────────────────────────────────────────────┘

Config Panel (slide in from right when ⚙ clicked):
  - Dataset: [Cora] [Citeseer] [Upload CSV]
  - Epochs: slider 10–300
  - Learning Rate: 0.001 / 0.01 / 0.05
  - Hidden Dims: 16 / 32 / 64 / 128
  - Dropout: 0.0 / 0.3 / 0.5
  - For GAT: Attention Heads: 1 / 2 / 4 / 8
  - For SAGE: Aggregator: [Mean] [Max] [LSTM]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## BACKEND: WEBSOCKET + TRAINING LOOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Implement in /backend/main.py:

```python
# WebSocket endpoint: ws://localhost:8000/ws/train
@app.websocket("/ws/train")
async def train_websocket(websocket: WebSocket):
    await websocket.accept()
    config = await websocket.receive_json()

    model = build_model(config)  # GCN / GAT / SAGE
    optimizer = torch.optim.Adam(model.parameters(), lr=config['lr'])
    data = load_dataset(config['dataset'])

    epoch_snapshots = []

    for epoch in range(config['epochs']):
        # Training step
        model.train()
        optimizer.zero_grad()
        out, embedding, *attn = model(data.x, data.edge_index)
        loss = F.cross_entropy(out[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

        # Validation
        model.eval()
        with torch.no_grad():
            out_eval, embedding_eval, *attn_eval = model(data.x, data.edge_index)
            val_loss = F.cross_entropy(out_eval[data.val_mask], data.y[data.val_mask])
            pred = out_eval.argmax(dim=1)
            val_acc = (pred[data.val_mask] == data.y[data.val_mask]).float().mean()
            train_acc = (pred[data.train_mask] == data.y[data.train_mask]).float().mean()

        # PCA reduction for visualization
        emb_np = embedding_eval.detach().cpu().numpy()
        pca = PCA(n_components=2)
        emb_2d = pca.fit_transform(emb_np).tolist()

        # Attention weights (GAT only)
        attn_data = None
        if attn_eval:
            attn_data = attn_eval[0].detach().cpu().numpy().tolist()

        # Build snapshot
        snapshot = {
            "epoch": epoch,
            "node_predictions": pred.cpu().tolist(),
            "embeddings_2d": emb_2d,
            "attention_weights": attn_data,
            "train_loss": loss.item(),
            "val_loss": val_loss.item(),
            "train_acc": train_acc.item(),
            "val_acc": val_acc.item(),
        }
        epoch_snapshots.append(snapshot)

        # Stream to frontend
        await websocket.send_json({
            "type": "epoch_snapshot",
            "data": snapshot,
            "progress": (epoch + 1) / config['epochs']
        })

    # Send complete signal with all snapshots
    await websocket.send_json({
        "type": "training_complete",
        "all_snapshots": epoch_snapshots
    })
```

REST endpoints also needed:
  GET  /api/datasets      → list available datasets
  POST /api/upload        → upload CSV, return node/edge counts
  GET  /api/snapshots     → return all_snapshots after training
  POST /api/stop          → stop current training

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## FRONTEND: KEY COMPONENT FILES TO CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/frontend/src/
├── App.jsx                    — root layout
├── store/
│   └── useGNNStore.js         — Zustand store (state management)
├── components/
│   ├── EpochPlayer/
│   │   ├── EpochPlayer.jsx    — video player controls
│   │   ├── Timeline.jsx       — scrubber bar (drag to seek)
│   │   └── SpeedSelector.jsx  — 0.5x 1x 2x 4x buttons
│   ├── TopologyView/
│   │   ├── TopologyView.jsx   — react-force-graph-2d wrapper
│   │   ├── NodeTooltip.jsx    — hover tooltip
│   │   ├── NodeInfoPanel.jsx  — click panel (class probs, attention)
│   │   ├── TaskTopology1.jsx  — node classification specific
│   │   ├── TaskTopology2.jsx  — graph classification grid
│   │   ├── TaskTopology3.jsx  — link prediction edge colors
│   │   ├── TaskTopology4.jsx  — community detection islands
│   │   ├── TaskTopology5.jsx  — proximity heatmap on edges
│   │   └── TaskTopology6.jsx  — generation preview panel
│   ├── EmbeddingView/
│   │   ├── EmbeddingView.jsx  — Plotly scatter 2D
│   │   └── LatentSpaceView.jsx — for Task 6 (VAE latent space)
│   ├── MetricsChart/
│   │   └── MetricsChart.jsx   — Recharts line chart
│   ├── ConfigPanel/
│   │   └── ConfigPanel.jsx    — settings slide-in
│   ├── TaskSelector.jsx       — 6 task buttons at top
│   ├── ModelSelector.jsx      — GCN / GAT / SAGE buttons
│   └── TrainingControls.jsx   — Start/Stop + hyperparams

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ZUSTAND STORE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```javascript
// /frontend/src/store/useGNNStore.js
import { create } from 'zustand'

const useGNNStore = create((set, get) => ({
  // Config
  selectedTask: 1,           // 1–6
  selectedModel: 'GCN',      // 'GCN' | 'GAT' | 'SAGE'
  hyperparams: {
    epochs: 100,
    lr: 0.01,
    hidden: 64,
    dropout: 0.5,
    heads: 4,                // GAT only
    aggregator: 'mean',      // SAGE only
  },

  // Training state
  isTraining: false,
  trainingProgress: 0,       // 0.0 – 1.0

  // Animation state
  snapshots: [],             // EpochSnapshot[]
  currentEpoch: 0,           // index into snapshots
  isPlaying: false,
  playbackSpeed: 1,          // 0.5 | 1 | 2 | 4
  playIntervalId: null,

  // Graph data
  graphData: null,           // { nodes: [], links: [] } for react-force-graph

  // UI state
  selectedNodeId: null,      // for info panel
  viewMode: 'prediction',    // 'prediction' | 'error' (Task 1)
  attentionHead: 'avg',      // 'avg' | 0 | 1 | 2 | 3 (GAT)

  // Actions
  setTask: (task) => set({ selectedTask: task, snapshots: [], currentEpoch: 0 }),
  setModel: (model) => set({ selectedModel: model, snapshots: [], currentEpoch: 0 }),

  addSnapshot: (snapshot) => set(s => ({
    snapshots: [...s.snapshots, snapshot],
    currentEpoch: s.snapshots.length,  // auto-advance to latest while training
  })),

  setCurrentEpoch: (epoch) => {
    set({ currentEpoch: epoch })
    // All views react automatically via selector
  },

  play: () => {
    const { snapshots, currentEpoch, playbackSpeed } = get()
    if (currentEpoch >= snapshots.length - 1) {
      set({ currentEpoch: 0 })  // restart from beginning
    }
    const intervalId = setInterval(() => {
      const { currentEpoch, snapshots, isPlaying } = get()
      if (!isPlaying || currentEpoch >= snapshots.length - 1) {
        clearInterval(intervalId)
        set({ isPlaying: false, playIntervalId: null })
        return
      }
      set({ currentEpoch: currentEpoch + 1 })
    }, 1000 / playbackSpeed)
    set({ isPlaying: true, playIntervalId: intervalId })
  },

  pause: () => {
    const { playIntervalId } = get()
    if (playIntervalId) clearInterval(playIntervalId)
    set({ isPlaying: false, playIntervalId: null })
  },

  stepForward: () => {
    const { currentEpoch, snapshots } = get()
    if (currentEpoch < snapshots.length - 1)
      set({ currentEpoch: currentEpoch + 1 })
  },

  stepBack: () => {
    const { currentEpoch } = get()
    if (currentEpoch > 0)
      set({ currentEpoch: currentEpoch - 1 })
  },
}))

export default useGNNStore
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TOPOLOGY VIEW: ANIMATION IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```jsx
// /frontend/src/components/TopologyView/TaskTopology1.jsx
import ForceGraph2D from 'react-force-graph-2d'
import useGNNStore from '../../store/useGNNStore'
import { useMemo } from 'react'

const CLASS_COLORS = [
  '#E53935','#1E88E5','#43A047','#FB8C00',
  '#8E24AA','#E91E63','#F9A825'
]

export default function TaskTopology1({ graphData }) {
  const { snapshots, currentEpoch, selectedNodeId } = useGNNStore()
  const snapshot = snapshots[currentEpoch]

  // Build colored node data from current snapshot
  const coloredGraph = useMemo(() => {
    if (!graphData || !snapshot) return graphData
    return {
      nodes: graphData.nodes.map(node => ({
        ...node,
        color: CLASS_COLORS[snapshot.node_predictions[node.id]] || '#999',
        // CSS transition handled by react-force-graph internally
      })),
      links: graphData.links,
    }
  }, [graphData, snapshot])

  return (
    <ForceGraph2D
      graphData={coloredGraph}
      nodeColor={node => node.color}
      nodeRelSize={4}
      nodeVal={node => Math.sqrt(node.degree || 1) * 2}
      linkColor={() => '#cccccc44'}
      linkWidth={0.5}
      onNodeClick={(node) => useGNNStore.getState().setSelectedNode(node.id)}
      nodeCanvasObjectMode={() => 'after'}
      nodeCanvasObject={(node, ctx) => {
        // Draw white ring for train nodes
        if (node.inTrainSet) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI)
          ctx.strokeStyle = 'white'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }}
      cooldownTicks={0}      // disable physics after layout
      d3VelocityDecay={0.9}
    />
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## EMBEDDING VIEW: PLOTLY ANIMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```jsx
// /frontend/src/components/EmbeddingView/EmbeddingView.jsx
import Plot from 'react-plotly.js'
import useGNNStore from '../../store/useGNNStore'

export default function EmbeddingView() {
  const { snapshots, currentEpoch } = useGNNStore()
  const snapshot = snapshots[currentEpoch]
  if (!snapshot) return null

  const x = snapshot.embeddings_2d.map(p => p[0])
  const y = snapshot.embeddings_2d.map(p => p[1])
  const colors = snapshot.node_predictions

  return (
    <Plot
      data={[{
        type: 'scatter',
        mode: 'markers',
        x, y,
        marker: {
          color: colors,
          colorscale: [
            [0, '#E53935'], [0.17, '#1E88E5'], [0.33, '#43A047'],
            [0.5, '#FB8C00'], [0.67, '#8E24AA'], [0.83, '#E91E63'], [1, '#F9A825']
          ],
          size: 6,
          opacity: 0.8,
        },
        text: colors.map((c, i) => `Node ${i} | Class ${c}`),
        hoverinfo: 'text',
      }]}
      layout={{
        paper_bgcolor: '#0f172a',
        plot_bgcolor: '#0f172a',
        font: { color: '#94a3b8' },
        xaxis: { showgrid: false, zeroline: false },
        yaxis: { showgrid: false, zeroline: false },
        margin: { l:30, r:10, t:10, b:30 },
        // Smooth transitions between epochs
        transition: { duration: 200, easing: 'cubic-in-out' },
      }}
      style={{ width:'100%', height:'100%' }}
      useResizeHandler
    />
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## EPOCH PLAYER: TIMELINE SCRUBBER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```jsx
// /frontend/src/components/EpochPlayer/Timeline.jsx
import { useRef } from 'react'
import useGNNStore from '../../store/useGNNStore'

export default function Timeline() {
  const { snapshots, currentEpoch, setCurrentEpoch, pause } = useGNNStore()
  const total = snapshots.length
  const barRef = useRef(null)

  const seekTo = (e) => {
    if (!barRef.current || total === 0) return
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetEpoch = Math.floor(ratio * (total - 1))
    pause()
    setCurrentEpoch(targetEpoch)
  }

  const progress = total > 0 ? (currentEpoch / (total - 1)) * 100 : 0

  return (
    <div className="px-4 py-2">
      <div
        ref={barRef}
        className="relative h-2 bg-slate-700 rounded-full cursor-pointer group"
        onClick={seekTo}
        onMouseDown={(e) => {
          seekTo(e)
          const onMove = (ev) => seekTo(ev)
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      >
        {/* Progress bar */}
        <div
          className="absolute h-full bg-blue-500 rounded-full transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
        {/* Epoch tick marks */}
        {Array.from({ length: Math.min(total, 20) }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 w-px h-full bg-slate-500 opacity-40"
            style={{ left: `${(i / 19) * 100}%` }}
          />
        ))}
        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full
                     shadow-lg -translate-x-1/2 opacity-0 group-hover:opacity-100
                     transition-opacity"
          style={{ left: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>Epoch 0</span>
        <span className="text-white font-bold">
          Epoch {currentEpoch} / {total - 1}
        </span>
        <span>Epoch {total - 1}</span>
      </div>
    </div>
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## COLOR SCHEME & STYLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dark theme throughout. Tailwind classes:
  - Background: bg-slate-950 (main), bg-slate-900 (panels), bg-slate-800 (cards)
  - Text: text-slate-100 (primary), text-slate-400 (secondary)
  - Accent: blue-500 for GCN, green-500 for GAT, orange-500 for SAGE
  - Borders: border-slate-700
  - Panel headers: uppercase text-xs tracking-wider text-slate-400

Node class colors (colorblind-safe):
  Class 0: #E53935  (red)
  Class 1: #1E88E5  (blue)
  Class 2: #43A047  (green)
  Class 3: #FB8C00  (orange)
  Class 4: #8E24AA  (purple)
  Class 5: #E91E63  (pink)
  Class 6: #F9A825  (yellow)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## MOCK DATA MODE (for offline/demo without backend)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create /frontend/src/mock/generateMockSnapshots.js that:
1. Generates a random graph with N=50 nodes, 7 classes
2. Simulates 100 epochs of "learning":
   - Epoch 0: predictions = random (accuracy ~14%)
   - Each epoch: accuracy increases by ~0.7% ± random noise
   - Embeddings: start as random 2D points, gradually cluster by class
     (interpolate between random positions and class-centroid positions)
   - Loss: starts at 1.94, decays exponentially with noise
   - GAT attention: starts uniform, gradually focuses on same-class edges

Add a [Mock Mode] toggle button in the UI header.
When enabled, training uses mock data and no backend is needed.
This lets the demo run completely in-browser for presentations.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PROJECT STRUCTURE TO CREATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

gnn-insight/
├── README.md
├── docker-compose.yml        (optional, for easy deployment)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── store/
│       │   └── useGNNStore.js
│       ├── hooks/
│       │   └── useWebSocket.js
│       ├── mock/
│       │   └── generateMockSnapshots.js
│       ├── utils/
│       │   ├── colors.js
│       │   └── graphUtils.js
│       └── components/
│           ├── EpochPlayer/
│           ├── TopologyView/
│           ├── EmbeddingView/
│           ├── MetricsChart/
│           ├── ConfigPanel/
│           ├── TaskSelector.jsx
│           ├── ModelSelector.jsx
│           └── TrainingControls.jsx
└── backend/
    ├── requirements.txt
    ├── main.py               (FastAPI app)
    ├── models/
    │   ├── gcn.py
    │   ├── gat.py
    │   └── graphsage.py
    ├── tasks/
    │   ├── node_classification.py
    │   ├── graph_classification.py
    │   ├── link_prediction.py
    │   ├── community_detection.py
    │   ├── graph_embedding.py
    │   └── graph_generation.py
    └── data/
        └── loaders.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## BUILD ORDER (tell AI to follow this sequence)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Scaffold project structure + install dependencies
Step 2: Zustand store + mock data generator
Step 3: EpochPlayer + Timeline scrubber (works with mock data)
Step 4: TopologyView Task 1 + EmbeddingView + MetricsChart (mock data)
Step 5: Backend GCN model + WebSocket endpoint
Step 6: Connect frontend WebSocket → replace mock with real training
Step 7: GAT attention map visualization
Step 8: GraphSAGE + inductive node demo
Step 9: Remaining 5 tasks (2–6) one by one
Step 10: ConfigPanel + polish + responsive layout

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## IMPORTANT CONSTRAINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ALL 100 epoch snapshots must be stored BEFORE playback begins.
   Do NOT stream and play simultaneously — store all, then enable player.
   Show a loading bar while training runs, then unlock player when done.

2. The video player must work OFFLINE (mock mode) without any backend.
   This is critical for classroom/demo presentations.

3. React re-renders must be optimized:
   - Use useMemo for coloredGraph derived from snapshot
   - Use useCallback for event handlers
   - Plotly updates via Plotly.react() (not full re-render)
   - react-force-graph: pass new graphData object with same structure

4. The force graph layout must STABILIZE once and not keep moving:
   - After initial layout: set d3VelocityDecay=0.9, cooldownTicks=100
   - Node positions FIXED after epoch 0 layout
   - Only colors/sizes change between epochs, not positions

5. Error handling:
   - Backend disconnects: show reconnect button
   - Training error: show error toast with Python traceback snippet
   - Invalid CSV: show format guide modal

Now start building. Begin with Step 1: scaffold the project structure and
create package.json + requirements.txt. Then proceed through all steps.
Do not stop until the complete working application is built.
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHẦN B – PROMPT ĐỂ YÊU CẦU TỪNG BƯỚC (dùng khi AI bị dừng giữa chừng)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP_PROMPTS = {

"step1_scaffold": """
Create the complete project scaffold for gnn-insight with:
1. /frontend/package.json with exact dependencies:
   react, react-dom, vite, tailwindcss, zustand,
   react-force-graph-2d, plotly.js, react-plotly.js,
   recharts, framer-motion
2. /backend/requirements.txt:
   fastapi, uvicorn, torch, torch_geometric, scikit-learn, networkx, pandas, numpy
3. All empty file stubs for every file in the project structure
4. vite.config.js with proxy: { '/ws': { target: 'ws://localhost:8000', ws: true }}
5. tailwind.config.js with dark mode support
6. A working README.md with setup commands
""",

"step2_mock_and_store": """
Build the mock data system and Zustand store:

1. /frontend/src/mock/generateMockSnapshots.js
   - Create a graph: 50 nodes, 7 classes, edges using Barabasi-Albert model
   - Generate 100 snapshots simulating learning:
     * node_predictions: starts random, accuracy increases from 14% to ~80%
     * embeddings_2d: starts as gaussian noise, by epoch 80 forms 7 clear clusters
       (interpolate: position = lerp(random_pos, class_centroid, progress^0.6))
     * train_loss: 1.94 * exp(-epoch/30) + 0.05 + noise(0, 0.02)
     * val_loss: similar but slightly higher
     * train_acc, val_acc: sigmoid curve from 0.14 to 0.82
     * attention_weights: starts uniform, by epoch 50 focuses on same-class edges
   - Export: { graphData, snapshots }

2. /frontend/src/store/useGNNStore.js
   - Full store as specified with all actions
   - Play/pause with setInterval
   - Scrub seek function
""",

"step3_epoch_player": """
Build the EpochPlayer component:

/frontend/src/components/EpochPlayer/EpochPlayer.jsx
  - Buttons: |◄ ◄ ▶/⏸ ► ►|
  - Speed selector: 0.5x 1x 2x 4x (changes playback interval)
  - "Epoch X / Y" display with large current epoch number
  - When at epoch 0 and press |◄: go to epoch 0
  - When at last epoch: stop playing, show replay button

/frontend/src/components/EpochPlayer/Timeline.jsx
  - Full-width scrubber bar
  - Click to seek, drag to scrub (smooth)
  - Show small tick marks every N epochs
  - Show current position as glowing dot
  - Epoch numbers shown at 0%, 25%, 50%, 75%, 100% positions

Style: dark theme, blue accent, minimal and clean.
Test with mock data from store.
""",

"step4_three_views": """
Build the 3 main views wired to the Zustand store:

1. TopologyView (TaskTopology1.jsx for node classification):
   - react-force-graph-2d
   - Reads snapshot from store, maps node_predictions to CLASS_COLORS
   - Node sizes proportional to degree
   - White border ring on train set nodes
   - On hover: tooltip showing node ID, class, predicted class
   - On click: sets selectedNodeId in store
   - IMPORTANT: freeze layout after first render (cooldownTicks=0 after tick 100)
   - Toggle button: Prediction Mode / Error Mode (green/red coloring)

2. EmbeddingView.jsx:
   - Plotly scatter with transition: {duration: 200}
   - Reads embeddings_2d and node_predictions from current snapshot
   - Show Silhouette Score badge (compute from embeddings using your own simple formula)
   - 2D only is fine (optional 3D toggle)

3. MetricsChart.jsx:
   - Recharts LineChart
   - Show data from snapshots[0] to snapshots[currentEpoch] (slice)
   - 4 colored lines: train_loss(red), val_loss(orange), train_acc(green), val_acc(blue)
   - Responsive, dark themed
   - Dashed vertical line at best val_acc epoch

Wire everything to mock data. The full animation should work in browser now.
""",

"step5_backend": """
Build the Python backend:

/backend/models/gcn.py — GCNModel class using PyG GCNConv
/backend/models/gat.py — GATModel using GATConv, returns attention weights
/backend/models/graphsage.py — SAGEModel using SAGEConv

/backend/data/loaders.py:
  - load_cora(): return PyG Data object
  - load_citeseer(): return PyG Data object
  - load_csv(nodes_path, edges_path): convert to PyG Data

/backend/main.py:
  - FastAPI app
  - WebSocket /ws/train: receive config JSON, train model, stream snapshots
  - POST /api/stop: set stop flag
  - GET /api/datasets: return ["cora", "citeseer"]
  - CORS enabled for localhost:5173

Training loop must:
  - After each epoch: PCA reduce embeddings to 2D
  - Stream snapshot as JSON via websocket
  - Check stop flag and break if set
  - Handle exceptions and send error message to frontend
""",

"step6_websocket_connect": """
Connect frontend to backend WebSocket:

/frontend/src/hooks/useWebSocket.js:
  - useWebSocket(url) hook
  - On message type "epoch_snapshot": call store.addSnapshot(data)
  - On message type "training_complete": set isTraining=false, unlock player
  - On message type "error": show error toast
  - Export: { connect, disconnect, send, status }

/frontend/src/components/TrainingControls.jsx:
  - Start button: send config JSON to websocket, set isTraining=true
  - Stop button: send stop signal, call disconnect
  - Progress bar: 0→100% based on training progress messages
  - "Collecting epoch snapshots..." label while training
  - "Training complete! 100 epochs ready to play ▶" when done
  - LOCK EpochPlayer during training (show loading skeleton)
  - UNLOCK EpochPlayer after training_complete received

Also add [Mock Mode] toggle in header:
  - When enabled: loads mock snapshots instantly, no websocket
  - When disabled: requires backend connection
""",

"step7_gat_attention": """
Implement GAT Attention Map visualization:

In TaskTopology1.jsx (or new GATTopologyView.jsx):
  - When model === 'GAT' AND snapshot.attention_weights is not null:
    * Map edge thickness to attention weight: 1px (weight=0) to 6px (weight=1)
    * Map edge color: #444444 (low) gradient to #1E88E5 (high)
    * Normalize weights per-node (each node's weights sum to 1)

Add AttentionHeadSelector component:
  - Buttons: [Avg] [Head 1] [Head 2] [Head 3] [Head 4]
  - Changes which attention head's weights are displayed
  - Store selected head in Zustand

NodeInfoPanel.jsx (when GAT + node clicked):
  - Show: Node ID, Ground Truth, Predicted Class
  - Softmax probability bar chart (horizontal bars)
  - "Top 5 Neighbors by Attention Weight" table:
    | Neighbor ID | Class | Attention Weight | ████░░ bar |
  - Animate this panel sliding in from right

Add a legend overlay on Topology View:
  "Edge thickness = attention weight"
  Show thin→thick bar with label "Low → High attention"
""",

"step8_graphsage_inductive": """
Implement GraphSAGE-specific features:

1. Inductive Learning Demo button: [+ Add New Node]
   - Opens a modal: "Enter node features (comma-separated 1433 values)"
   - OR: "Random node" button generates random features
   - OR: "Clone node #___" copies an existing node's features
   - On submit: POST /api/inductive-predict {features, model_state}
   - Backend: encode new node features → run through SAGE → return predicted class
   - Frontend: add new node to graph with predicted color, pulsing animation
   - Show badge: "New node predicted as: Class 3 (Neural Networks)"

2. Variance indicator in MetricsChart:
   - Compute rolling variance of last 5 val_acc values
   - When variance > 0.01: show ⚠️ badge "High variance (normal for SAGE)"
   - Shade the "noisy" regions of the loss curve with a light orange background

3. Loss curve annotation:
   - Add small text label on chart: "SAGE uses random sampling → expect more noise"
""",

"step9_remaining_tasks": """
Implement Tasks 2–6 topology views:

TASK 2 (Graph Classification):
  - Generate 50 mini synthetic graphs on backend startup
  - Render 5×10 CSS grid of ForceGraph2D thumbnails (each ~120×120px)
  - Border color: green (correct prediction) or red (wrong)
  - Border width = confidence (0–1 → 1px–5px)
  - Click to expand: show full graph + node contribution heatmap

TASK 3 (Link Prediction):
  - Edge color based on link score from snapshot
  - Add "Show predicted future links" toggle (dashed orange edges)
  - ROC curve in metrics chart instead of loss

TASK 4 (Community Detection):
  - Force graph with repulsion between communities
  - Node border white + thick for bridge nodes
  - Modularity Q displayed as large badge (not accuracy)
  - Dendrogram panel with K slider

TASK 5 (Graph Embedding):
  - Edge color = blue (close in embedding) or red (far in embedding)
  - Embedding View is primary/largest panel
  - Structure Preservation % badge

TASK 6 (Graph Generation):
  - 2×3 grid showing 6 generated graphs sampled this epoch
  - "Valid/Invalid" label under each
  - Latent space scatter where each point = one training graph
  - Validity/Uniqueness/Novelty % badges in metrics panel
""",

"step10_polish": """
Final polish pass:

1. Responsive layout: works on 1280px+ screens. Panels resize correctly.

2. Loading states:
   - Skeleton loaders for all 3 views during initial backend connection
   - Spinner while uploading CSV

3. Export features:
   - "Export PNG" button on Topology View (html2canvas)
   - "Export Snapshots JSON" button (download all epoch data)

4. Keyboard shortcuts:
   - Space: play/pause
   - ← →: step back/forward one epoch
   - Shift+← Shift+→: jump 10 epochs
   - 1-4: set speed (1x, 2x, 4x, 0.5x)

5. Tutorial overlay:
   - First time user: pulsing highlights on key UI elements
   - Tooltip: "Click here to start training →"
   - Can dismiss with "Got it" button

6. Performance:
   - Memoize all graph data derivations with useMemo
   - Virtualize large node lists in info panel
   - Debounce websocket messages if they come too fast

7. Error boundaries around each view panel

8. Docker setup (optional):
   docker-compose.yml with frontend + backend services
"""

}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHẦN C – QUICK START COMMANDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUICK_START = """
# ─── BACKEND ───────────────────────────────────────────
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# ─── FRONTEND ──────────────────────────────────────────
cd frontend
npm install
npm run dev
# Open: http://localhost:5173

# ─── DEMO WITHOUT BACKEND ──────────────────────────────
# Click [Mock Mode] toggle in the top-right corner of the app
# Training runs instantly in browser with simulated data
# All animation features work offline
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHẦN D – PROMPT ĐỂ FIX LỖI THƯỜNG GẶP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIX_PROMPTS = {

"fix_graph_jumping": """
The force graph nodes keep jumping/repositioning between epochs.
Fix this by:
1. After the graph finishes initial layout (cooldownTicks reaches 0),
   snapshot all node x,y positions into a ref
2. On subsequent epoch changes, manually set node.fx = node.x, node.fy = node.y
   for every node (this pins them in place)
3. Only color changes should trigger re-render, not position changes
4. Use d3.forceSimulation().stop() after initial layout
""",

"fix_slow_animation": """
The epoch animation is lagging / frames drop when playing.
Fix this by:
1. Pre-compute all coloredGraph objects for all epochs upfront
   (useMemo based on ALL snapshots at once, not just current)
2. Store them in a ref: epochGraphs.current[i] = coloredGraph
3. On epoch tick: just do ref lookup, no computation
4. For Plotly: use Plotly.animate() with frame data pre-built
5. For Recharts: pre-slice data arrays and cache them
""",

"fix_websocket_disconnect": """
WebSocket disconnects during long training runs.
Fix this by:
1. Backend: add keepalive ping every 10 seconds
   async def ping_keepalive(websocket):
       while True:
           await asyncio.sleep(10)
           await websocket.send_json({"type": "ping"})
2. Frontend: handle "ping" message type (ignore it)
3. Add reconnection logic with exponential backoff
4. Show connection status indicator (green dot = connected)
""",

"fix_plotly_flicker": """
Plotly scatter flickers/disappears between epoch transitions.
Fix this by:
1. Use Plotly.react() instead of recreating the Plot component
2. Pre-define the layout once and reuse it
3. Set transition: { duration: 150, easing: 'linear' }
4. Ensure x,y arrays always have same length between updates
5. Use uirevision: 'constant' in layout to preserve zoom/pan
""",

}
