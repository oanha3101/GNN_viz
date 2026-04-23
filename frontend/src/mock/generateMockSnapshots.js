/**
 * generateMockSnapshots.js
 *
 * KEY DESIGN: All randomness is SEEDED per (nodeId, epoch) so the animation
 * plays like a film — each node has a fixed "convergence epoch" where it
 * starts being predicted correctly and stays correct afterward.
 *
 * No Math.random() inside epoch loops — only deterministic functions.
 */

// ── Seeded random helpers ──────────────────────────────────────────────────────
function seededRand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

function seededRandRange(seed, min, max) {
  return min + seededRand(seed) * (max - min)
}

function seededRandInt(seed, min, max) {
  return Math.floor(seededRandRange(seed, min, max + 1))
}

// Smooth sigmoid curve 0→1
function sigmoid(x) {
  return 1 / (1 + Math.exp(-x))
}

// Smooth lerp
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// ── Task 1: Node Classification ───────────────────────────────────────────────
export function generateTask1Mock(numNodes = 60, numEpochs = 100) {
  const numClasses = 7

  // Fixed ground truth per node (seeded)
  const groundTruth = Array.from({ length: numNodes }, (_, i) =>
    seededRandInt(i * 1000 + 1, 0, numClasses - 1)
  )

  // Build graph (Barabási-Albert style, fully deterministic)
  const links = []
  const linkSet = new Set()
  const degrees = new Array(numNodes).fill(0)

  const addEdge = (s, t) => {
    const key = `${Math.min(s, t)}-${Math.max(s, t)}`
    if (s !== t && !linkSet.has(key)) {
      linkSet.add(key)
      links.push({ source: s, target: t })
      degrees[s]++; degrees[t]++
    }
  }

  // Seeded initial clique
  for (let i = 0; i < Math.min(5, numNodes); i++)
    for (let j = i + 1; j < Math.min(5, numNodes); j++)
      addEdge(i, j)

  // Seeded preferential attachment
  for (let i = 5; i < numNodes; i++) {
    const numEdges = seededRandInt(i * 7 + 2, 2, 4)
    for (let e = 0; e < numEdges; e++) {
      const target = seededRandInt(i * 31 + e * 13, 0, i - 1)
      addEdge(i, target)
    }
    // Homophily: same-class bonds
    for (let j = 0; j < i; j++) {
      if (groundTruth[j] === groundTruth[i] && seededRand(i * 100 + j) < 0.3)
        addEdge(i, j)
    }
  }

  const trainMask = Array.from({ length: numNodes }, (_, i) => seededRand(i * 777) < 0.6)

  // Each node has a fixed "convergence epoch" — before it: wrong, after: correct
  // Earlier-index nodes converge faster (simulates how training works)
  const convergeEpoch = Array.from({ length: numNodes }, (_, i) => {
    // Range: epoch 5 to epoch 70, distributed with some spread
    return Math.floor(seededRandRange(i * 999 + 7, 0.05, 0.70) * numEpochs)
  })

  // Fixed "wrong class" for each node (what it predicts before converging)
  const wrongClass = Array.from({ length: numNodes }, (_, i) => {
    let wrong = seededRandInt(i * 333, 0, numClasses - 1)
    if (wrong === groundTruth[i]) wrong = (wrong + 1) % numClasses
    return wrong
  })

  // Pre-compute embedding centroids (fixed)
  const randomPositions = Array.from({ length: numNodes }, (_, i) => [
    (seededRand(i * 41) - 0.5) * 8,
    (seededRand(i * 73) - 0.5) * 8,
  ])
  const classCentroids = Array.from({ length: numClasses }, (_, c) => {
    const angle = (2 * Math.PI * c) / numClasses
    return [Math.cos(angle) * 6, Math.sin(angle) * 6]
  })

  // Global accuracy curve shape (smooth sigmoid)
  const baseAccuracy = (epoch) =>
    0.14 + 0.68 * sigmoid(10 * (epoch / numEpochs - 0.3))

  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const progress = epoch / numEpochs

    // ── Node predictions: deterministic per-node convergence ─────────────
    const nodePredictions = Array.from({ length: numNodes }, (_, i) => {
      if (epoch >= convergeEpoch[i]) return groundTruth[i]   // Converged ✓
      // Before convergence: mostly wrong, with some random flips from seed
      const noise = seededRand(i * 10000 + epoch * 31)
      const localProgress = epoch / Math.max(convergeEpoch[i], 1)
      // Small chance of being right early (partially learned)
      if (noise < localProgress * 0.3) return groundTruth[i]
      // Otherwise stuck on wrong class
      return wrongClass[i]
    })

    // ── Embeddings: smooth interpolation to class centroids ──────────────
    const clusterProgress = Math.pow(progress, 0.55)
    const noiseScale = 0.5 * (1 - clusterProgress) + 0.05

    const embeddings2d = Array.from({ length: numNodes }, (_, i) => {
      const classId = groundTruth[i]
      // Tiny per-node jitter that stays fixed (seeded by nodeId only)
      const jx = (seededRand(i * 229) - 0.5) * noiseScale
      const jy = (seededRand(i * 317) - 0.5) * noiseScale
      return [
        lerp(randomPositions[i][0], classCentroids[classId][0], clusterProgress) + jx,
        lerp(randomPositions[i][1], classCentroids[classId][1], clusterProgress) + jy,
      ]
    })

    // ── Node Confidences: Smoothly rising as epoch advances ───────────────
    const nodeConfidences = Array.from({ length: numNodes }, (_, i) => {
      const distToConverge = Math.max(0, convergeEpoch[i] - epoch)
      const baseConf = sigmoid(6 * (progress - distToConverge / numEpochs))
      const jitter = (seededRand(i * 511 + epoch) - 0.5) * 0.05
      return Math.max(1 / numClasses, Math.min(0.99, baseConf + jitter))
    })

    // ── Node Correctness: Per-node accuracy flag ──────────────────────────
    const nodeCorrectness = nodePredictions.map((pred, i) => 
      pred === groundTruth[i] ? 1 : 0
    )

    // ── Neighbor Majority Context ─────────────────────────────────────────
    // Build adjacency list
    const neighbors = Array.from({ length: numNodes }, () => [])
    links.forEach((link) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source
      const t = typeof link.target === 'object' ? link.target.id : link.target
      if (s !== t) {
        neighbors[s].push(t)
        neighbors[t].push(s)
      }
    })

    const neighborMajority = nodePredictions.map((pred, i) => {
      if (neighbors[i].length === 0) {
        return { majority_class: -1, majority_ratio: 0.0, total_neighbors: 0 }
      }
      // Count neighbor classes
      const classCounts = {}
      neighbors[i].forEach(n => {
        const neighborClass = nodePredictions[n]
        classCounts[neighborClass] = (classCounts[neighborClass] || 0) + 1
      })
      // Find majority
      let majorityClass = -1
      let maxCount = 0
      for (const [cls, count] of Object.entries(classCounts)) {
        if (count > maxCount) {
          maxCount = count
          majorityClass = parseInt(cls)
        }
      }
      return {
        majority_class: majorityClass,
        majority_ratio: maxCount / neighbors[i].length,
        total_neighbors: neighbors[i].length
      }
    })

    // ── Node Probabilities: Full softmax distribution ─────────────────────
    const nodeProbabilities = nodePredictions.map((pred, i) => {
      const confidence = nodeConfidences[i]
      // Create a probability distribution where predicted class has highest prob
      const probs = Array(numClasses).fill(0)
      probs[pred] = confidence
      // Distribute remaining probability among other classes
      const remaining = 1 - confidence
      const otherClasses = numClasses - 1
      for (let c = 0; c < numClasses; c++) {
        if (c !== pred) {
          probs[c] = remaining / otherClasses
        }
      }
      return probs
    })

    // ── Metrics (deterministic smooth curves) ────────────────────────────
    const actualAcc = nodePredictions.filter((p, i) => p === groundTruth[i]).length / numNodes
    // Small fixed noise per epoch (seeded)
    const trainNoise = (seededRand(epoch * 17 + 1) - 0.5) * 0.012
    const valNoise   = (seededRand(epoch * 23 + 3) - 0.5) * 0.018
    const lossNoise  = (seededRand(epoch * 37 + 5) - 0.5) * 0.015

    const trainLoss = Math.max(0.02, 1.94 * Math.exp(-epoch / 25) + 0.05 + lossNoise)
    const valLoss   = Math.max(0.02, 1.94 * Math.exp(-epoch / 30) + 0.12 + lossNoise * 1.3)
    const trainAcc  = Math.min(1, Math.max(0, actualAcc + trainNoise + 0.02))
    const valAcc    = Math.min(1, Math.max(0, actualAcc - 0.04 + valNoise))

    // ── Attention weights (for GAT): smooth per-edge evolution ───────────
    const attentionWeights = links.map((link, li) => {
      const s = typeof link.source === 'object' ? link.source.id : link.source
      const t = typeof link.target === 'object' ? link.target.id : link.target
      const sameClass = groundTruth[s] === groundTruth[t]
      // Base attention grows with progress for same-class edges
      const base = sameClass
        ? 0.25 + 0.55 * sigmoid(8 * (progress - 0.25))
        : 0.55 - 0.35 * sigmoid(8 * (progress - 0.25))
      // Fixed small per-edge noise
      const jitter = (seededRand(li * 71 + 9) - 0.5) * 0.06
      return Math.max(0.05, Math.min(1, base + jitter))
    })

    snapshots.push({
      epoch,
      node_predictions: nodePredictions,
      node_probabilities: nodeProbabilities,
      node_confidence: nodeConfidences,
      node_correctness: nodeCorrectness,
      neighbor_majority: neighborMajority,
      embeddings_2d: embeddings2d,
      attention_weights: attentionWeights,
      node_confidences: nodeConfidences,
      train_loss: trainLoss,
      val_loss: valLoss,
      train_acc: trainAcc,
      val_acc: valAcc,
    })
  }

  const nodes = Array.from({ length: numNodes }, (_, i) => ({
    id: i, degree: degrees[i], groundTruth: groundTruth[i], inTrainSet: trainMask[i],
  }))

  return { graphData: { nodes, links }, snapshots, groundTruth, trainMask }
}


// ── Task 2: Graph Classification ──────────────────────────────────────────────
export function generateTask2Mock(numGraphs = 50, numEpochs = 80) {
  // Seeded graph generation
  const graphs = Array.from({ length: numGraphs }, (_, g) => {
    const n = seededRandInt(g * 1337 + 1, 6, 14)
    const gt = g % 2  // 0 = ER-like (dense), 1 = scale-free (sparse)
    const nodes = Array.from({ length: n }, (_, i) => ({ id: i }))
    const links = []

    const edgeProb = gt === 0 ? 0.55 : 0.25
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (seededRand(g * 10000 + i * 100 + j) < edgeProb)
          links.push({ source: i, target: j })
      }
    }
    // Ensure at least one edge
    if (links.length === 0 && n > 1) links.push({ source: 0, target: 1 })

    return { id: g, nodes, links, groundTruth: gt }
  })

  // Each graph has a fixed convergence epoch
  const graphConvergeEpoch = Array.from({ length: numGraphs }, (_, g) =>
    Math.floor(seededRandRange(g * 999 + 17, 0.1, 0.65) * numEpochs)
  )
  const graphWrongPred = Array.from({ length: numGraphs }, (_, g) =>
    (graphs[g].groundTruth + 1) % 2
  )

  // Starting positions for embeddings
  const startPos = Array.from({ length: numGraphs }, (_, g) => [
    (seededRand(g * 41) - 0.5) * 8,
    (seededRand(g * 73) - 0.5) * 8,
  ])

  // Fake "important" node for each graph (for readout heatmap)
  const importantNode = Array.from({ length: numGraphs }, (_, g) =>
    seededRandInt(g * 777, 0, graphs[g].nodes.length - 1)
  )

  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const progress = epoch / numEpochs

    const predictions = graphs.map((g, gi) => {
      if (epoch >= graphConvergeEpoch[gi]) return g.groundTruth
      const noise = seededRand(gi * 9999 + epoch * 7)
      const localProg = epoch / Math.max(graphConvergeEpoch[gi], 1)
      if (noise < localProg * 0.25) return g.groundTruth
      return graphWrongPred[gi]
    })

    // Confidence: smoothly rises as epoch advances
    const confidences = graphs.map((g, gi) => {
      const distToConverge = Math.max(0, graphConvergeEpoch[gi] - epoch)
      const baseConf = sigmoid(5 * (progress - distToConverge / numEpochs))
      const jitter = (seededRand(gi * 511 + epoch) - 0.5) * 0.06
      return Math.max(0.5, Math.min(0.99, baseConf + jitter))
    })

    // Graph Embeddings (moving to clusters 0 and 1)
    const clusterProgress = Math.pow(progress, 0.6)
    const embeddings2d = graphs.map((g, gi) => {
      // Create a static localized target for each graph so they form a beautiful cloud cluster
      const targetX = (g.groundTruth === 0 ? -5 : 5) + (seededRand(gi * 111) - 0.5) * 4.5
      const targetY = (seededRand(gi * 222) - 0.5) * 4.5
      
      const jx = (seededRand(gi * 229 + epoch) - 0.5) * (1 - clusterProgress)
      const jy = (seededRand(gi * 317 + epoch) - 0.5) * (1 - clusterProgress)
      
      return [lerp(startPos[gi][0], targetX, clusterProgress) + jx, lerp(startPos[gi][1], targetY, clusterProgress) + jy]
    })

    // Node contributions (readout heatmap)
    // As epoch increases, the "important" node gets higher score, others drop
    const nodeContributions = graphs.map((g, gi) => {
      const imp = importantNode[gi]
      return g.nodes.map((n, ni) => {
        const base = ni === imp ? 0.2 + 0.8 * progress : 0.2 + 0.3 * (1 - progress)
        const jitter = (seededRand(gi * 100 + ni + epoch * 13) - 0.5) * 0.1
        return Math.max(0, Math.min(1, base + jitter))
      })
    })

    const lossNoise = (seededRand(epoch * 41) - 0.5) * 0.018
    const trainLoss = Math.max(0.05, 1.1 * Math.exp(-epoch / 20) + 0.1 + lossNoise)
    const valLoss   = Math.max(0.05, 1.1 * Math.exp(-epoch / 25) + 0.18 + lossNoise * 1.2)
    const acc = predictions.filter((p, i) => p === graphs[i].groundTruth).length / numGraphs
    const trainAcc = Math.min(1, acc + (seededRand(epoch * 13) - 0.5) * 0.015)
    const valAcc   = Math.min(1, acc - 0.03 + (seededRand(epoch * 19) - 0.5) * 0.02)

    // Derived fields: enrich snapshot so new Task 2 dashboards (Confusion,
    // Hard Cases, Diagnostics) work in Mock Mode without needing the backend.
    const graphCorrect = predictions.map((p, i) => (p === graphs[i].groundTruth ? 1 : 0))

    // Probabilities: turn confidence into a two-class distribution so
    // confidence_margins come out sensible (top1 ~ conf, top2 ~ 1 - conf).
    const graphProbabilities = predictions.map((p, i) => {
      const c = confidences[i]
      const row = [1 - c, 1 - c]
      row[p] = c
      return row
    })
    const confidenceMargins = confidences.map((c) => Math.max(0, 2 * c - 1))

    // Attention entropy: higher when training is early or node contributions
    // are diffuse. Compute from the mock contributions so the value is
    // consistent with what the Readout heatmap shows.
    const attentionEntropy = nodeContributions.map((arr) => {
      if (!arr.length) return 0
      const sum = arr.reduce((s, v) => s + (v > 0 ? v : 0), 0)
      if (sum <= 0) return 0
      let h = 0
      for (const v of arr) {
        if (v <= 0) continue
        const pv = v / sum
        h -= pv * Math.log(pv)
      }
      const hmax = Math.log(arr.length)
      return hmax > 0 ? h / hmax : 0
    })

    // Structural metrics — constant per graph; compute once on first epoch.
    const graphStructuralMetrics = graphs.map((g) => {
      const n = g.nodes.length
      const e = g.links.length
      const maxEdges = (n * (n - 1)) / 2
      const density = maxEdges > 0 ? e / maxEdges : 0
      const deg = new Array(n).fill(0)
      g.links.forEach((l) => {
        deg[l.source] += 1
        deg[l.target] += 1
      })
      const avgDegree = n > 0 ? deg.reduce((s, v) => s + v, 0) / n : 0
      // Rough clustering approximation — we don't need exact NX value in mock.
      const avgClustering = Math.min(1, density * 0.9)
      return { density, avg_degree: avgDegree, avg_clustering: avgClustering }
    })

    snapshots.push({
      epoch,
      graph_predictions: predictions,
      graph_confidences: confidences,
      graph_probabilities: graphProbabilities,
      confidence_margins: confidenceMargins,
      attention_entropy: attentionEntropy,
      graph_structural_metrics: graphStructuralMetrics,
      graph_correct: graphCorrect,
      graph_embeddings_2d: embeddings2d,
      node_contributions: nodeContributions,
      train_loss: Math.max(0, trainLoss),
      val_loss: Math.max(0, valLoss),
      train_acc: Math.max(0, trainAcc),
      val_acc: Math.max(0, valAcc),
    })
  }

  return { graphs, snapshots }
}


// ── Task 3: Link Prediction ───────────────────────────────────────────────────
export function generateTask3Mock(numNodes = 40, numEpochs = 80) {
  const links = []
  const linkSet = new Set()
  const degrees = new Array(numNodes).fill(0)

  const addEdge = (s, t) => {
    const key = `${Math.min(s, t)}-${Math.max(s, t)}`
    if (s !== t && !linkSet.has(key)) {
      linkSet.add(key)
      links.push({ source: s, target: t })
      degrees[s]++; degrees[t]++
    }
  }

  // Seeded graph construction
  for (let i = 1; i < numNodes; i++) {
    addEdge(i, seededRandInt(i * 997, 0, i - 1))
    if (seededRand(i * 503) < 0.4)
      addEdge(i, seededRandInt(i * 1009, 0, i - 1))
  }

  // Positive test edges (last 20% of links)
  const positiveEdges = links.slice(-10).map((l, i) => ({
    ...l, exists: true, idx: i,
  }))
  // Negative test edges (seeded pairs not in linkSet)
  const negativeEdges = []
  for (let attempt = 0; negativeEdges.length < 10 && attempt < 200; attempt++) {
    const s = seededRandInt(attempt * 777 + 1, 0, numNodes - 1)
    const t = seededRandInt(attempt * 333 + 5, 0, numNodes - 1)
    const key = `${Math.min(s, t)}-${Math.max(s, t)}`
    if (s !== t && !linkSet.has(key))
      negativeEdges.push({ source: s, target: t, exists: false, idx: negativeEdges.length + 10 })
  }
  const testEdges = [...positiveEdges, ...negativeEdges]

  // Each test edge has a fixed "convergence score path"
  // Positive edges: score rises toward 1; Negative edges: score drops toward 0
  const edgeFinalScore = testEdges.map((e, i) => (e.exists ? 0.88 : 0.08))
  const edgeInitScore  = testEdges.map((e, i) => (e.exists ? 0.25 : 0.75))

  // Generate initial random node positions for embedding view
  const initEmb = Array.from({ length: numNodes }, (_, i) => [
    (seededRand(i * 123 + 7) - 0.5) * 10,
    (seededRand(i * 456 + 13) - 0.5) * 10
  ])

  // Target positions: connected nodes cluster together
  // Build adjacency for clustering
  const adj = Array.from({ length: numNodes }, () => [])
  links.forEach(l => {
    adj[l.source].push(l.target)
    adj[l.target].push(l.source)
  })
  // Simple: target = average of neighbor initial positions (creates clustering)
  const targetEmb = initEmb.map((pos, i) => {
    if (adj[i].length === 0) return pos
    const avgX = adj[i].reduce((a, n) => a + initEmb[n][0], 0) / adj[i].length
    const avgY = adj[i].reduce((a, n) => a + initEmb[n][1], 0) / adj[i].length
    return [avgX * 0.7 + pos[0] * 0.3, avgY * 0.7 + pos[1] * 0.3]
  })

  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const progress = epoch / numEpochs
    const learningCurve = sigmoid(8 * (progress - 0.3))

    const edgeScores = testEdges.map((e, i) => {
      const target = edgeFinalScore[i]
      const start  = edgeInitScore[i]
      const smoothed = lerp(start, target, learningCurve)
      const jitter = (seededRand(i * 999 + epoch * 37) - 0.5) * 0.05
      return Math.max(0, Math.min(1, smoothed + jitter))
    })

    const auc = 0.5 + 0.38 * learningCurve + (seededRand(epoch * 71) - 0.5) * 0.01
    const lossNoise = (seededRand(epoch * 43) - 0.5) * 0.008
    const trainLoss = Math.max(0.02, 0.7 * Math.exp(-epoch / 25) + 0.05 + lossNoise)

    // Interpolate embeddings from random → clustered
    const embeddings_2d = initEmb.map((pos, i) => {
      const jx = (seededRand(i * 11 + epoch * 73) - 0.5) * 0.3 * (1 - progress)
      const jy = (seededRand(i * 17 + epoch * 91) - 0.5) * 0.3 * (1 - progress)
      return [
        lerp(pos[0], targetEmb[i][0], learningCurve) + jx,
        lerp(pos[1], targetEmb[i][1], learningCurve) + jy
      ]
    })

    snapshots.push({
      epoch,
      edge_scores: edgeScores,
      embeddings_2d,
      train_loss: trainLoss,
      val_loss: trainLoss * 1.12,
      train_acc: Math.min(1, auc),
      val_acc: Math.min(1, auc),
      auc,
      ap: auc * 0.94,
    })
  }

  const nodes = Array.from({ length: numNodes }, (_, i) => ({
    id: i, degree: degrees[i],
  }))
  return { graphData: { nodes, links }, testEdges, snapshots }
}


// ── Task 4: Community Detection ───────────────────────────────────────────────
export function generateTask4Mock(numCommunities = 4, nodesPerComm = 12, numEpochs = 80) {
  const numNodes = numCommunities * nodesPerComm
  const communityGT = Array.from({ length: numNodes }, (_, i) => Math.floor(i / nodesPerComm))
  const links = []
  const linkSet = new Set()
  const degrees = new Array(numNodes).fill(0)

  const addEdge = (s, t) => {
    const key = `${Math.min(s, t)}-${Math.max(s, t)}`
    if (s !== t && !linkSet.has(key)) {
      linkSet.add(key)
      links.push({ source: s, target: t, intra: communityGT[s] === communityGT[t] })
      degrees[s]++; degrees[t]++
    }
  }

  for (let c = 0; c < numCommunities; c++) {
    const start = c * nodesPerComm
    for (let i = start; i < start + nodesPerComm; i++)
      for (let j = i + 1; j < start + nodesPerComm; j++)
        if (seededRand(i * 500 + j) < 0.5) addEdge(i, j)
  }
  for (let i = 0; i < numNodes; i++)
    for (let j = i + 1; j < numNodes; j++)
      if (communityGT[i] !== communityGT[j] && seededRand(i * 200 + j * 7) < 0.03) addEdge(i, j)

  const convergeEpoch = Array.from({ length: numNodes }, (_, i) =>
    Math.floor(seededRandRange(i * 797, 0.1, 0.65) * numEpochs)
  )
  const wrongComm = Array.from({ length: numNodes }, (_, i) =>
    (communityGT[i] + 1 + seededRandInt(i * 131, 0, numCommunities - 2)) % numCommunities
  )

  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const predictions = communityGT.map((gt, i) => {
      if (epoch >= convergeEpoch[i]) return gt
      const noise = seededRand(i * 8888 + epoch * 11)
      return noise < (epoch / Math.max(convergeEpoch[i], 1)) * 0.2 ? gt : wrongComm[i]
    })
    const progress = epoch / numEpochs
    const lossNoise = (seededRand(epoch * 47) - 0.5) * 0.018
    const acc = predictions.filter((p, i) => p === communityGT[i]).length / numNodes
    // Community sizes
    const commSizes = Array.from({ length: numCommunities }, (_, c) =>
      predictions.filter(p => p === c).length
    )

    // Modularity Q — improves as predictions converge
    const modQ = Math.min(0.85, 0.1 + 0.7 * sigmoid(6 * (progress - 0.3)) + (seededRand(epoch * 59) - 0.5) * 0.02)

    // Conductance — decreases (better) as communities form
    const conductance = Math.max(0.02, 0.6 * Math.exp(-epoch / 18) + 0.05 + (seededRand(epoch * 67) - 0.5) * 0.02)

    // Bridge nodes — nodes with neighbors in different predicted communities
    const bridgeNodes = Array.from({ length: numNodes }, (_, i) => {
      const myComm = predictions[i]
      const hasInterComm = links.some(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source
        const t = typeof l.target === 'object' ? l.target.id : l.target
        if (s === i) return predictions[t] !== myComm
        if (t === i) return predictions[s] !== myComm
        return false
      })
      return hasInterComm
    })

    snapshots.push({
      epoch, node_predictions: predictions,
      bridge_nodes: bridgeNodes,
      modularity_q: modQ,
      conductance,
      community_sizes: commSizes,
      train_loss: Math.max(0, 1.4 * Math.exp(-epoch / 20) + 0.08 + lossNoise),
      val_loss:   Math.max(0, 1.4 * Math.exp(-epoch / 25) + 0.15 + lossNoise * 1.3),
      train_acc: Math.min(1, acc + (seededRand(epoch * 13 + 1) - 0.5) * 0.01),
      val_acc:   modQ,
    })
  }

  const nodes = Array.from({ length: numNodes }, (_, i) => ({
    id: i, degree: degrees[i], community: communityGT[i],
  }))
  return { graphData: { nodes, links }, snapshots, communityGT }
}


// ── Task 5: Custom Graph Upload + Unsupervised Embedding ──────────────────────
export function generateTask5Mock(numNodes = 40, numEpochs = 80) {
  const links = []
  const linkSet = new Set()
  const degrees = new Array(numNodes).fill(0)

  // Determine if we have labels (simulate: 50% chance)
  const hasLabels = true  // always true for mock so we can test coloring
  const numClasses = 4
  const nodeLabels = Array.from({ length: numNodes }, (_, i) =>
    hasLabels ? seededRandInt(i * 997, 0, numClasses - 1) : 0
  )

  // Build graph (Barabási-Albert style)
  const addEdge = (s, t) => {
    const key = `${Math.min(s, t)}-${Math.max(s, t)}`
    if (s !== t && !linkSet.has(key)) {
      linkSet.add(key); links.push({ source: s, target: t }); degrees[s]++; degrees[t]++
    }
  }
  for (let i = 1; i < numNodes; i++) {
    addEdge(i, seededRandInt(i * 997, 0, i - 1))
    if (seededRand(i * 503) < 0.5) addEdge(i, seededRandInt(i * 1009, 0, i - 1))
    if (seededRand(i * 701) < 0.2) addEdge(i, seededRandInt(i * 1013, 0, i - 1))
  }

  // Starting positions
  const startPos = Array.from({ length: numNodes }, (_, i) => [
    (seededRand(i * 41) - 0.5) * 8, (seededRand(i * 73) - 0.5) * 8,
  ])

  // Cluster centers based on labels
  const clusterCenters = Array.from({ length: numClasses }, (_, c) => [
    Math.cos(c * 2 * Math.PI / numClasses) * 5,
    Math.sin(c * 2 * Math.PI / numClasses) * 5,
  ])

  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const progress = Math.pow(epoch / numEpochs, 0.6)

    // PCA-like embeddings
    const embeddings = Array.from({ length: numNodes }, (_, i) => {
      const label = nodeLabels[i]
      const cx = clusterCenters[label][0]
      const cy = clusterCenters[label][1]
      const jx = (seededRand(i * 229 + epoch) - 0.5) * (2 * (1 - progress) + 0.3)
      const jy = (seededRand(i * 317 + epoch) - 0.5) * (2 * (1 - progress) + 0.3)
      return [lerp(startPos[i][0], cx, progress) + jx, lerp(startPos[i][1], cy, progress) + jy]
    })

    // t-SNE (slightly rotated version)
    const tsne = Array.from({ length: numNodes }, (_, i) => {
      const label = nodeLabels[i]
      const angle = label * (2 * Math.PI / numClasses) + Math.PI / 6
      const radius = 4 * progress
      const jx = (seededRand(i * 401 + epoch) - 0.5) * (1.5 * (1 - progress) + 0.2)
      const jy = (seededRand(i * 509 + epoch) - 0.5) * (1.5 * (1 - progress) + 0.2)
      return [lerp(startPos[i][0], Math.cos(angle) * radius, progress) + jx,
              lerp(startPos[i][1], Math.sin(angle) * radius, progress) + jy]
    })

    // Metrics
    const reconstructionLoss = Math.max(0.02, 0.9 * Math.exp(-epoch / 20) + 0.05 + (seededRand(epoch * 37) - 0.5) * 0.01)
    const knnPres = Math.min(0.95, 0.15 + 0.75 * sigmoid(6 * (progress - 0.3)) + (seededRand(epoch * 89) - 0.5) * 0.02)
    const linkAuc = Math.min(0.97, 0.5 + 0.44 * sigmoid(6 * (progress - 0.25)) + (seededRand(epoch * 97) - 0.5) * 0.015)
    const isotropyScore = Math.min(0.9, 0.3 + 0.55 * sigmoid(4 * (progress - 0.2)) + (seededRand(epoch * 113) - 0.5) * 0.03)

    // Proximity scores (per edge, top 50)
    const proximityScores = links.slice(0, 50).map((l, li) => {
      const s = l.source, t = l.target
      const sameCluster = nodeLabels[s] === nodeLabels[t]
      const base = sameCluster ? 0.5 + 0.45 * progress : 0.4 - 0.15 * progress
      const jitter = (seededRand(li * 71 + epoch) - 0.5) * 0.1
      return {
        source: s, target: t,
        score: Math.max(0.05, Math.min(0.99, base + jitter))
      }
    })

    // Per-node diagnostics — outlier, knn preservation, embedding norm.
    // Mix structural (degree) + cluster-center distance so the top rows feel
    // meaningful across epochs.
    const cx0 = embeddings.reduce((s, p) => s + p[0], 0) / numNodes
    const cy0 = embeddings.reduce((s, p) => s + p[1], 0) / numNodes
    const perNodeKnn = new Array(numNodes)
    const outlierScores = new Array(numNodes)
    const embeddingNorms = new Array(numNodes)
    for (let i = 0; i < numNodes; i++) {
      const dx = embeddings[i][0] - cx0
      const dy = embeddings[i][1] - cy0
      const distFromCenter = Math.sqrt(dx * dx + dy * dy)
      embeddingNorms[i] = Math.sqrt(embeddings[i][0] ** 2 + embeddings[i][1] ** 2)
      // Higher degree + well-clustered nodes → higher knn preservation.
      const degreeBoost = Math.min(1, (degrees[i] || 1) / 8)
      const knnBase = knnPres * (0.7 + 0.3 * degreeBoost)
      perNodeKnn[i] = Math.max(0, Math.min(1, knnBase + (seededRand(i * 131 + epoch) - 0.5) * 0.15))
      // Outliers: nodes far from cluster centre + low knn.
      outlierScores[i] = Math.max(0, Math.min(1,
        0.5 * (distFromCenter / 8) + 0.5 * (1 - perNodeKnn[i]) + (seededRand(i * 193 + epoch) - 0.5) * 0.05
      ))
    }

    snapshots.push({
      epoch,
      embeddings_2d: embeddings,
      tsne_2d: tsne,
      node_predictions: nodeLabels,
      knn_preservation: knnPres,
      link_recon_auc: linkAuc,
      isotropy_score: isotropyScore,
      reconstruction_loss: reconstructionLoss,
      proximity_scores: proximityScores,
      outlier_scores: outlierScores,
      per_node_knn_preservation: perNodeKnn,
      embedding_norms: embeddingNorms,
      train_loss: reconstructionLoss,
      val_loss: reconstructionLoss * 1.12,
      train_acc: knnPres,
      val_acc: linkAuc,
    })
  }

  const nodes = Array.from({ length: numNodes }, (_, i) => ({
    id: i, degree: degrees[i], groundTruth: nodeLabels[i],
  }))

  // Graph metadata (mimics backend auto_detect_graph)
  const graphMeta = {
    num_nodes: numNodes,
    num_edges: links.length,
    has_features: false,
    feature_dim: 7,
    feature_source: 'degree',
    has_labels: hasLabels,
    num_classes: numClasses,
  }

  return { graphData: { nodes, links }, snapshots, graphMeta, groundTruth: nodeLabels }
}


// ── Task 6: Graph Generation ──────────────────────────────────────────────────
export function generateTask6Mock(numEpochs = 60) {
  const snapshots = []
  for (let epoch = 0; epoch < numEpochs; epoch++) {
    const progress = epoch / numEpochs
    const quality = 0.1 + 0.7 * Math.pow(progress, 0.8)

    const generatedGraphs = Array.from({ length: 6 }, (_, g) => {
      const n = seededRandInt(epoch * 600 + g * 100, 5, 10)
      const nodes = Array.from({ length: n }, (_, i) => ({ id: i }))
      const links = []
      const edgeProb = 0.15 + quality * 0.25
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          if (seededRand(epoch * 6000 + g * 1000 + i * 100 + j) < edgeProb)
            links.push({ source: i, target: j })
      const density = links.length / Math.max(1, (n * (n - 1)) / 2)
      const avgDegree = (links.length * 2) / Math.max(1, n)
      const valid = links.length >= n - 1
      const isolatedRatio = Math.max(0, (n - Math.min(n, links.length * 2)) / n)
      return {
        id: g,
        nodes,
        links,
        valid,
        score: quality,
        density,
        avg_degree: avgDegree,
        isolated_ratio: isolatedRatio,
      }
    })

    const latentPoints = Array.from({ length: 30 }, (_, i) => [
      (seededRand(i * 311 + epoch * 7) - 0.5) * 2 * (1 + (1 - progress) * 2),
      (seededRand(i * 419 + epoch * 11) - 0.5) * 2 * (1 + (1 - progress) * 2),
    ])
    const latentPointScores = latentPoints.map(([x, y]) => {
      const radial = Math.sqrt(x * x + y * y)
      return Math.max(0, Math.min(1, 1 - radial / 4))
    })
    const latentPointValidity = latentPointScores.map((score, i) =>
      score > 0.45 || seededRand(epoch * 97 + i * 17) > 0.55 ? 1 : 0
    )

    const lossNoise = (seededRand(epoch * 53) - 0.5) * 0.015
    const reconLoss = Math.max(0.05, 2.0 * Math.exp(-epoch / 15) + 0.1 + lossNoise)
    const klLoss    = Math.max(0.01, 0.5 * Math.exp(-epoch / 20) + 0.02 + lossNoise * 0.5)

    // Generation quality metrics
    const validCount = generatedGraphs.filter(g => g.valid).length
    const validityRate = validCount / generatedGraphs.length
    const uniquenessRate = Math.min(1, 0.3 + 0.65 * sigmoid(5 * (progress - 0.2)) + (seededRand(epoch * 79) - 0.5) * 0.03)
    const noveltyRate = Math.min(1, 0.2 + 0.6 * sigmoid(4 * (progress - 0.35)) + (seededRand(epoch * 83) - 0.5) * 0.04)

    snapshots.push({
      epoch, generated_graphs: generatedGraphs, latent_points: latentPoints,
      latent_point_scores: latentPointScores,
      latent_point_validity: latentPointValidity,
      train_loss: reconLoss + klLoss, val_loss: (reconLoss + klLoss) * 1.1,
      train_acc: Math.min(1, quality), val_acc: Math.min(1, quality * 0.9),
      recon_loss: reconLoss, kl_loss: klLoss,
      validity_rate: validityRate,
      uniqueness_rate: uniquenessRate,
      novelty_rate: noveltyRate,
    })
  }
  return { snapshots }
}


// Default export (backward compatible)
export default function generateMockSnapshots(numNodes = 60, numEpochs = 100) {
  return generateTask1Mock(numNodes, numEpochs)
}
