"""
Analytics service for the AI Research Analyst platform.
Computes structural diagnostics, generates AI insights, failure patterns,
and recommendations from experiment snapshots and graph data.
"""

import math
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional

from services import llm_analyst_service

# ---------------------------------------------------------------------------
# Structural Diagnostics
# ---------------------------------------------------------------------------

def compute_structural_diagnostics(snapshots: List[Dict], graph_payload: Dict = None, model_type: str = "GCN") -> Dict:
    """Compute advanced structural diagnostics from epoch snapshots."""
    if not snapshots:
        return {}

    last_snap = snapshots[-1]
    first_snap = snapshots[0]

    diagnostics = {
        "convergence_speed": _compute_convergence_speed(snapshots),
        "stability_score": _compute_stability(snapshots),
        "overfitting_risk": _compute_overfitting_risk(snapshots),
        "over_smoothing_risk": _compute_over_smoothing_risk(snapshots),
        "boundary_accuracy": _compute_boundary_accuracy(last_snap, graph_payload),
        "homophily_fit": _compute_homophily_fit(last_snap, graph_payload),
        "prediction_entropy": _compute_prediction_entropy(last_snap),
        "confidence_calibration": _compute_confidence_calibration(last_snap),
        "embedding_separation": _compute_embedding_separation(last_snap),
        "attention_focus_score": _compute_attention_focus(last_snap, model_type),
        "energy_change": _compute_energy_change(snapshots),
        "topk_edge_concentration": _compute_topk_edge_concentration(last_snap),
        "training_efficiency": _compute_training_efficiency(snapshots),
        "loss_landscape_smoothness": _compute_loss_smoothness(snapshots),
    }

    # Add model-specific diagnostics
    if model_type == "GAT":
        diagnostics["attention_entropy"] = _compute_attention_entropy(last_snap)
        diagnostics["attention_head_diversity"] = _compute_attention_head_diversity(last_snap)
    elif model_type == "GCN":
        diagnostics["neighborhood_coherence"] = _compute_neighborhood_coherence(last_snap, graph_payload)
    elif model_type == "SAGE":
        diagnostics["sampling_robustness"] = _compute_sampling_robustness(last_snap)

    return diagnostics


def _compute_convergence_speed(snapshots: List[Dict]) -> Dict:
    """How fast the model reaches 95% of its best score."""
    scores = [s.get("val_acc", s.get("train_acc", 0)) for s in snapshots]
    if not scores:
        return {"epoch": 0, "speed": "unknown", "score": 0}

    best = max(scores)
    if best <= 0:
        return {"epoch": len(snapshots), "speed": "no_improvement", "score": 0}

    target = best * 0.95
    for i, s in enumerate(scores):
        if s >= target:
            speed = "fast" if i < len(snapshots) * 0.3 else "moderate" if i < len(snapshots) * 0.6 else "slow"
            return {"epoch": i, "speed": speed, "score": s}

    return {"epoch": len(snapshots) - 1, "speed": "slow", "score": scores[-1]}


def _compute_stability(snapshots: List[Dict]) -> Dict:
    """Measure variance in the last 30% of training."""
    val_accs = [s.get("val_acc", 0) for s in snapshots]
    if len(val_accs) < 5:
        return {"score": 0.5, "label": "insufficient_data"}

    tail = val_accs[int(len(val_accs) * 0.7):]
    if not tail:
        return {"score": 0.5, "label": "insufficient_data"}

    mean = sum(tail) / len(tail)
    if mean == 0:
        return {"score": 0, "label": "unstable"}

    variance = sum((x - mean) ** 2 for x in tail) / len(tail)
    cv = math.sqrt(variance) / mean  # coefficient of variation

    if cv < 0.02:
        return {"score": 0.95, "label": "very_stable", "cv": round(cv, 4)}
    elif cv < 0.05:
        return {"score": 0.8, "label": "stable", "cv": round(cv, 4)}
    elif cv < 0.1:
        return {"score": 0.6, "label": "moderate", "cv": round(cv, 4)}
    else:
        return {"score": 0.3, "label": "unstable", "cv": round(cv, 4)}


def _compute_overfitting_risk(snapshots: List[Dict]) -> Dict:
    """Detect overfitting by measuring train-val gap widening."""
    if len(snapshots) < 5:
        return {"risk": "low", "gap": 0, "trend": "stable"}

    gaps = []
    for s in snapshots:
        train = s.get("train_acc", 0)
        val = s.get("val_acc", 0)
        gaps.append(train - val)

    # Check if gap is widening
    early_gap = sum(gaps[:len(gaps)//3]) / max(1, len(gaps)//3)
    late_gap = sum(gaps[len(gaps)*2//3:]) / max(1, len(gaps) - len(gaps)*2//3)
    gap_trend = late_gap - early_gap

    current_gap = max(gaps[-1], 0) if gaps else 0

    if current_gap > 0.2 or gap_trend > 0.1:
        return {"risk": "high", "gap": round(current_gap, 4), "trend": round(gap_trend, 4), "label": "overfitting"}
    elif current_gap > 0.1 or gap_trend > 0.05:
        return {"risk": "moderate", "gap": round(current_gap, 4), "trend": round(gap_trend, 4), "label": "mild_overfitting"}
    else:
        return {"risk": "low", "gap": round(current_gap, 4), "trend": round(gap_trend, 4), "label": "healthy"}


def _compute_over_smoothing_risk(snapshots: List[Dict]) -> Dict:
    """Detect over-smoothing via dirichlet energy collapse."""
    energies = [s.get("dirichlet_energy", 0) for s in snapshots]
    if not energies or all(e == 0 for e in energies):
        return {"risk": "unknown", "collapse_ratio": 0}

    initial = energies[0] if energies[0] > 0 else max(energies[:3]) if len(energies) >= 3 else 1
    current = energies[-1]
    if initial == 0:
        return {"risk": "unknown", "collapse_ratio": 0}

    collapse_ratio = current / initial

    if collapse_ratio < 0.05:
        return {"risk": "high", "collapse_ratio": round(collapse_ratio, 4), "label": "severe_collapse"}
    elif collapse_ratio < 0.15:
        return {"risk": "moderate", "collapse_ratio": round(collapse_ratio, 4), "label": "moderate_smoothing"}
    elif collapse_ratio < 0.3:
        return {"risk": "low", "collapse_ratio": round(collapse_ratio, 4), "label": "mild_smoothing"}
    else:
        return {"risk": "none", "collapse_ratio": round(collapse_ratio, 4), "label": "healthy"}


def _compute_boundary_accuracy(snapshot: Dict, graph_payload: Dict = None) -> Dict:
    """Compute accuracy specifically on boundary nodes (neighbors of different classes)."""
    if not snapshot:
        return {"score": 0, "label": "no_data"}

    majority_ratios = snapshot.get("majority_ratio", [])
    correctness = snapshot.get("node_correctness", [])

    if not majority_ratios or not correctness:
        return {"score": 0, "label": "no_data", "boundary_count": 0}

    # Boundary nodes: majority_ratio < 0.6 (mixed neighborhood)
    boundary_indices = [i for i, r in enumerate(majority_ratios) if r < 0.6 and i < len(correctness)]
    if not boundary_indices:
        return {"score": 1.0, "label": "no_boundary_nodes", "boundary_count": 0}

    boundary_correct = sum(1 for i in boundary_indices if correctness[i])
    score = boundary_correct / len(boundary_indices)

    return {
        "score": round(score, 4),
        "boundary_count": len(boundary_indices),
        "boundary_correct": boundary_correct,
        "label": "strong" if score > 0.7 else "moderate" if score > 0.5 else "weak",
    }


def _compute_homophily_fit(snapshot: Dict, graph_payload: Dict = None) -> Dict:
    """Assess how well the model fits the graph's homophily structure."""
    if not snapshot:
        return {"score": 0, "label": "no_data"}

    majority_ratios = snapshot.get("majority_ratio", [])
    correctness = snapshot.get("node_correctness", [])

    if not majority_ratios or not correctness:
        return {"score": 0, "label": "no_data"}

    # Compute correlation between majority_ratio and correctness
    n = min(len(majority_ratios), len(correctness))
    if n < 2:
        return {"score": 0, "label": "insufficient_data"}

    mean_r = sum(majority_ratios[:n]) / n
    mean_c = sum(correctness[:n]) / n

    cov = sum((majority_ratios[i] - mean_r) * (correctness[i] - mean_c) for i in range(n))
    std_r = math.sqrt(sum((majority_ratios[i] - mean_r) ** 2 for i in range(n)))
    std_c = math.sqrt(sum((correctness[i] - mean_c) ** 2 for i in range(n)))

    if std_r == 0 or std_c == 0:
        return {"score": 0, "label": "no_variance"}

    correlation = cov / (std_r * std_c)

    # High correlation = model leverages homophily well
    if correlation > 0.6:
        return {"score": round(correlation, 4), "label": "strong_homophily_fit", "homophilic": True}
    elif correlation > 0.3:
        return {"score": round(correlation, 4), "label": "moderate_fit", "homophilic": True}
    elif correlation > 0:
        return {"score": round(correlation, 4), "label": "weak_fit", "homophilic": False}
    else:
        return {"score": round(correlation, 4), "label": "heterophilic_behavior", "homophilic": False}


def _compute_prediction_entropy(snapshot: Dict) -> Dict:
    """Compute entropy of prediction confidence distribution."""
    probs = snapshot.get("node_probabilities", [])
    if not probs:
        return {"mean_entropy": 0, "label": "no_data"}

    entropies = []
    for p_vec in probs:
        if not p_vec:
            continue
        h = -sum(p * math.log(p + 1e-10) for p in p_vec if p > 0)
        entropies.append(h)

    if not entropies:
        return {"mean_entropy": 0, "label": "no_data"}

    mean_h = sum(entropies) / len(entropies)
    max_h = math.log(len(probs[0])) if probs and probs[0] else 1

    normalized = mean_h / max_h if max_h > 0 else 0

    return {
        "mean_entropy": round(mean_h, 4),
        "normalized_entropy": round(normalized, 4),
        "label": "confident" if normalized < 0.3 else "moderate" if normalized < 0.6 else "uncertain",
    }


def _compute_confidence_calibration(snapshot: Dict) -> Dict:
    """Check if confidence aligns with correctness."""
    confidences = snapshot.get("node_confidence", [])
    correctness = snapshot.get("node_correctness", [])

    if not confidences or not correctness:
        return {"score": 0, "label": "no_data"}

    n = min(len(confidences), len(correctness))
    # Bin by confidence and check accuracy per bin
    bins = defaultdict(lambda: {"correct": 0, "total": 0})
    for i in range(n):
        c = confidences[i]
        bin_idx = min(int(c * 10), 9)
        bins[bin_idx]["total"] += 1
        if correctness[i]:
            bins[bin_idx]["correct"] += 1

    # Expected Calibration Error
    ece = 0
    total = 0
    for bin_idx, data in bins.items():
        if data["total"] == 0:
            continue
        conf_mid = (bin_idx + 0.5) / 10
        acc = data["correct"] / data["total"]
        ece += data["total"] * abs(acc - conf_mid)
        total += data["total"]

    ece = ece / total if total > 0 else 0

    return {
        "ece": round(ece, 4),
        "label": "well_calibrated" if ece < 0.05 else "moderate" if ece < 0.15 else "miscalibrated",
    }


def _compute_embedding_separation(snapshot: Dict) -> Dict:
    """Compute inter-class vs intra-class embedding distance ratio."""
    embeddings = snapshot.get("embeddings_2d", [])
    predictions = snapshot.get("node_predictions", [])

    if not embeddings or not predictions:
        return {"score": 0, "label": "no_data"}

    # Group embeddings by predicted class
    class_groups = defaultdict(list)
    for i, (emb, pred) in enumerate(zip(embeddings, predictions)):
        if i < len(embeddings):
            class_groups[pred].append(emb)

    if len(class_groups) < 2:
        return {"score": 0, "label": "single_class"}

    # Compute centroids
    centroids = {}
    for cls, embs in class_groups.items():
        if not embs:
            continue
        dim = len(embs[0]) if embs else 0
        centroid = [sum(e[d] for e in embs) / len(embs) for d in range(dim)]
        centroids[cls] = centroid

    # Intra-class distance
    intra_sum = 0
    intra_count = 0
    for cls, embs in class_groups.items():
        if cls not in centroids:
            continue
        c = centroids[cls]
        for e in embs:
            d = math.sqrt(sum((e[i] - c[i]) ** 2 for i in range(min(len(e), len(c)))))
            intra_sum += d
            intra_count += 1

    intra_avg = intra_sum / intra_count if intra_count > 0 else 0

    # Inter-class distance
    inter_sum = 0
    inter_count = 0
    cls_list = list(centroids.keys())
    for i in range(len(cls_list)):
        for j in range(i + 1, len(cls_list)):
            c1 = centroids[cls_list[i]]
            c2 = centroids[cls_list[j]]
            d = math.sqrt(sum((c1[k] - c2[k]) ** 2 for k in range(min(len(c1), len(c2)))))
            inter_sum += d
            inter_count += 1

    inter_avg = inter_sum / inter_count if inter_count > 0 else 0

    ratio = inter_avg / (intra_avg + 1e-10)

    return {
        "ratio": round(ratio, 4),
        "inter_avg": round(inter_avg, 4),
        "intra_avg": round(intra_avg, 4),
        "label": "well_separated" if ratio > 3 else "moderate" if ratio > 1.5 else "overlapping",
    }


def _compute_attention_focus(snapshot: Dict, model_type: str) -> Dict:
    """Compute how focused GAT attention is."""
    if model_type != "GAT":
        return {"score": None, "label": "not_applicable", "model": model_type}

    attention_edges = snapshot.get("attention_edges", [])
    if not attention_edges:
        return {"score": None, "label": "no_attention_data"}

    weights = [e.get("weight", 0) if isinstance(e, dict) else 0 for e in attention_edges]
    if not weights:
        return {"score": None, "label": "no_weights"}

    # Higher concentration = more focused
    mean_w = sum(weights) / len(weights)
    max_w = max(weights)
    top5 = sorted(weights, reverse=True)[:max(1, len(weights) // 20)]
    top5_share = sum(top5) / sum(weights) if sum(weights) > 0 else 0

    return {
        "top5_share": round(top5_share, 4),
        "max_weight": round(max_w, 4),
        "mean_weight": round(mean_w, 4),
        "label": "focused" if top5_share > 0.3 else "moderate" if top5_share > 0.15 else "diffuse",
    }


def _compute_attention_entropy(snapshot: Dict) -> Dict:
    """Entropy of attention weight distribution."""
    attention_edges = snapshot.get("attention_edges", [])
    if not attention_edges:
        return {"entropy": 0, "label": "no_data"}

    weights = [e.get("weight", 0) if isinstance(e, dict) else 0 for e in attention_edges]
    total = sum(weights)
    if total == 0:
        return {"entropy": 0, "label": "no_data"}

    probs = [w / total for w in weights]
    entropy = -sum(p * math.log(p + 1e-10) for p in probs if p > 0)
    max_entropy = math.log(len(weights)) if weights else 1
    normalized = entropy / max_entropy if max_entropy > 0 else 0

    return {
        "entropy": round(entropy, 4),
        "normalized": round(normalized, 4),
        "label": "focused" if normalized < 0.5 else "moderate" if normalized < 0.8 else "diffuse",
    }


def _compute_attention_head_diversity(snapshot: Dict) -> Dict:
    """Check if different GAT heads attend to different patterns."""
    per_head = snapshot.get("attention_per_head", [])

    # Runtime shape from Task 1 GAT is typically:
    #   {"1-4": [0.2, 0.6, 0.1, 0.3], "4-7": [...]}
    # where each entry stores per-head weights for one edge.
    # Older or alternate callers may provide a list-of-lists directly.
    head_vectors: List[List[float]] = []
    if isinstance(per_head, dict):
        candidate_vectors = per_head.values()
    elif isinstance(per_head, list):
        candidate_vectors = per_head
    else:
        candidate_vectors = []

    for vector in candidate_vectors:
        if not isinstance(vector, list):
            continue
        clean = []
        for value in vector:
            if isinstance(value, (int, float)) and math.isfinite(value):
                clean.append(float(value))
        if clean:
            head_vectors.append(clean)

    if len(head_vectors) < 2:
        return {"diversity": 0, "label": "single_head"}

    # Compare head distributions via cosine similarity
    similarities = []
    for i in range(len(head_vectors)):
        for j in range(i + 1, len(head_vectors)):
            w_i = head_vectors[i]
            w_j = head_vectors[j]
            n = min(len(w_i), len(w_j))
            if n == 0:
                continue
            dot = sum(w_i[k] * w_j[k] for k in range(n))
            norm_i = math.sqrt(sum(w_i[k] ** 2 for k in range(n)))
            norm_j = math.sqrt(sum(w_j[k] ** 2 for k in range(n)))
            if norm_i > 0 and norm_j > 0:
                similarities.append(dot / (norm_i * norm_j))

    if not similarities:
        return {"diversity": 0, "label": "no_data"}

    avg_sim = sum(similarities) / len(similarities)
    diversity = 1 - avg_sim

    return {
        "diversity": round(diversity, 4),
        "avg_similarity": round(avg_sim, 4),
        "label": "diverse" if diversity > 0.3 else "moderate" if diversity > 0.1 else "redundant",
    }


def _compute_neighborhood_coherence(snapshot: Dict, graph_payload: Dict = None) -> Dict:
    """GCN-specific: how coherent are neighbor predictions."""
    preds = snapshot.get("node_predictions", [])
    if not preds:
        return {"score": 0, "label": "no_data"}

    # Use neighbor_majority if available
    neighbor_data = snapshot.get("neighbor_majority", [])
    if neighbor_data:
        ratios = [n.get("majority_ratio", 0) for n in neighbor_data if isinstance(n, dict)]
        if ratios:
            avg_ratio = sum(ratios) / len(ratios)
            return {
                "score": round(avg_ratio, 4),
                "label": "highly_coherent" if avg_ratio > 0.8 else "moderate" if avg_ratio > 0.6 else "fragmented",
            }

    return {"score": 0, "label": "no_neighbor_data"}


def _compute_sampling_robustness(snapshot: Dict) -> Dict:
    """SAGE-specific: robustness under different sampling."""
    robustness = snapshot.get("sage_robustness", None)
    if robustness is None:
        return {"score": None, "label": "not_computed"}

    if isinstance(robustness, (int, float)):
        return {
            "score": round(robustness, 4),
            "label": "robust" if robustness > 0.9 else "moderate" if robustness > 0.7 else "fragile",
        }
    return {"score": 0, "label": "no_data"}


def _compute_energy_change(snapshots: List[Dict]) -> Dict:
    """Track dirichlet energy trajectory."""
    energies = [s.get("dirichlet_energy", 0) for s in snapshots]
    if not energies or all(e == 0 for e in energies):
        return {"initial": 0, "final": 0, "change": 0, "label": "no_data"}

    initial = energies[0]
    final = energies[-1]
    change = (final - initial) / (initial + 1e-10)

    return {
        "initial": round(initial, 4),
        "final": round(final, 4),
        "change": round(change, 4),
        "label": "collapsing" if change < -0.8 else "smoothing" if change < -0.5 else "stable",
    }


def _compute_topk_edge_concentration(snapshot: Dict) -> Dict:
    """What fraction of total attention/weight is in top-k edges."""
    attention_edges = snapshot.get("attention_edges", [])
    if not attention_edges:
        return {"score": None, "label": "no_data"}

    weights = sorted(
        [e.get("weight", 0) if isinstance(e, dict) else 0 for e in attention_edges],
        reverse=True,
    )
    total = sum(weights)
    if total == 0:
        return {"score": 0, "label": "no_weights"}

    k = max(1, len(weights) // 10)
    topk_share = sum(weights[:k]) / total

    return {
        "topk": k,
        "share": round(topk_share, 4),
        "label": "concentrated" if topk_share > 0.5 else "distributed",
    }


def _compute_training_efficiency(snapshots: List[Dict]) -> Dict:
    """Score how efficiently training epochs contribute to improvement."""
    if len(snapshots) < 3:
        return {"score": 0, "label": "insufficient_data"}

    scores = [s.get("val_acc", s.get("train_acc", 0)) for s in snapshots]
    improvements = [scores[i] - scores[i-1] for i in range(1, len(scores))]
    positive_epochs = sum(1 for x in improvements if x > 0)
    total_epochs = len(improvements)

    efficiency = positive_epochs / total_epochs if total_epochs > 0 else 0

    return {
        "efficiency": round(efficiency, 4),
        "positive_epochs": positive_epochs,
        "total_epochs": total_epochs,
        "label": "efficient" if efficiency > 0.6 else "moderate" if efficiency > 0.4 else "wasteful",
    }


def _compute_loss_smoothness(snapshots: List[Dict]) -> Dict:
    """Detect oscillations in loss curve."""
    losses = [s.get("train_loss", 0) for s in snapshots]
    if len(losses) < 5:
        return {"score": 0, "label": "insufficient_data"}

    # Count direction changes
    direction_changes = 0
    for i in range(2, len(losses)):
        prev_dir = losses[i-1] - losses[i-2]
        curr_dir = losses[i] - losses[i-1]
        if prev_dir * curr_dir < 0:
            direction_changes += 1

    oscillation_rate = direction_changes / (len(losses) - 2)

    return {
        "oscillation_rate": round(oscillation_rate, 4),
        "label": "smooth" if oscillation_rate < 0.3 else "moderate" if oscillation_rate < 0.5 else "noisy",
    }


# ---------------------------------------------------------------------------
# Failure Pattern Analysis
# ---------------------------------------------------------------------------

def analyze_failure_patterns(snapshots: List[Dict], graph_payload: Dict = None, model_type: str = "GCN") -> Dict:
    """Identify specific failure patterns in the model's behavior."""
    if not snapshots:
        return {"patterns": [], "summary": "No data available for failure analysis."}

    last_snap = snapshots[-1]
    patterns = []

    # Over-smoothing pattern
    energies = [s.get("dirichlet_energy", 0) for s in snapshots]
    if energies and energies[0] > 0 and energies[-1] < energies[0] * 0.05:
        patterns.append({
            "type": "over_smoothing",
            "severity": "high",
            "title": "Severe Over-Smoothing Detected",
            "description": f"Dirichlet energy collapsed from {energies[0]:.4f} to {energies[-1]:.4f} ({energies[-1]/energies[0]*100:.1f}% of initial). Node embeddings are becoming indistinguishable.",
            "recommendation": "Consider adding residual connections, reducing layers, or using JumpingKnowledge.",
            "affected": "all_nodes",
        })

    # Boundary node failure
    boundary = _compute_boundary_accuracy(last_snap, graph_payload)
    if boundary.get("boundary_count", 0) > 0 and boundary.get("score", 1) < 0.5:
        patterns.append({
            "type": "boundary_failure",
            "severity": "high",
            "title": "Poor Boundary Node Accuracy",
            "description": f"Only {boundary['boundary_correct']}/{boundary['boundary_count']} boundary nodes ({boundary['score']*100:.1f}%) are correctly classified. The model struggles at class interfaces.",
            "recommendation": "Consider attention mechanisms (GAT) or edge features to better handle mixed neighborhoods.",
            "affected": "boundary_nodes",
        })

    # Overfitting pattern
    overfit = _compute_overfitting_risk(snapshots)
    if overfit.get("risk") == "high":
        patterns.append({
            "type": "overfitting",
            "severity": "moderate",
            "title": "Overfitting Detected",
            "description": f"Train-val accuracy gap is {overfit['gap']*100:.1f}% and widening by {overfit['trend']*100:.1f}%. The model memorizes training data.",
            "recommendation": "Increase dropout, add weight decay, reduce hidden dimensions, or use data augmentation.",
            "affected": "generalization",
        })

    # GAT diffuse attention
    if model_type == "GAT":
        attention_focus = _compute_attention_focus(last_snap, "GAT")
        if attention_focus.get("label") == "diffuse":
            patterns.append({
                "type": "diffuse_attention",
                "severity": "moderate",
                "title": "GAT Attention Remains Diffuse",
                "description": f"Top-5% edges hold only {attention_focus.get('top5_share', 0)*100:.1f}% of total attention. The attention mechanism is not learning to focus on important neighbors.",
                "recommendation": "Try fewer attention heads, add attention regularization, or increase training epochs.",
                "affected": "attention_mechanism",
            })

    # Class confusion
    confusion = _detect_class_confusion(last_snap)
    if confusion:
        patterns.append(confusion)

    # SAGE sparse neighborhood failure
    if model_type == "SAGE":
        confidence = last_snap.get("node_confidence", [])
        if confidence:
            low_conf = sum(1 for c in confidence if c < 0.5) / len(confidence)
            if low_conf > 0.3:
                patterns.append({
                    "type": "sparse_neighborhood",
                    "severity": "moderate",
                    "title": "Low Confidence on Sparse Nodes",
                    "description": f"{low_conf*100:.1f}% of nodes have confidence below 50%. GraphSAGE sampling may miss important neighbors in sparse regions.",
                    "recommendation": "Increase sample size or add neighborhood aggregation layers.",
                    "affected": "sparse_nodes",
                })

    # Embedding collapse
    separation = _compute_embedding_separation(last_snap)
    if separation.get("label") == "overlapping":
        patterns.append({
            "type": "embedding_collapse",
            "severity": "high",
            "title": "Embedding Classes Overlapping",
            "description": f"Inter/intra-class distance ratio is {separation['ratio']:.2f}. Class embeddings are not well separated in latent space.",
            "recommendation": "Add contrastive loss, increase embedding dimension, or reduce number of GNN layers.",
            "affected": "latent_space",
        })

    summary = _build_failure_summary(patterns, model_type)

    return {
        "patterns": patterns,
        "pattern_count": len(patterns),
        "severity_counts": {
            "high": sum(1 for p in patterns if p["severity"] == "high"),
            "moderate": sum(1 for p in patterns if p["severity"] == "moderate"),
            "low": sum(1 for p in patterns if p["severity"] == "low"),
        },
        "summary": summary,
    }


def _detect_class_confusion(snapshot: Dict) -> Optional[Dict]:
    """Detect if specific classes are frequently confused."""
    preds = snapshot.get("node_predictions", [])
    confidences = snapshot.get("node_confidence", [])
    correctness = snapshot.get("node_correctness", [])

    if not preds or not correctness:
        return None

    # Find misclassified nodes and their confidence
    misclassified = [(i, preds[i], confidences[i] if i < len(confidences) else 0)
                     for i in range(min(len(preds), len(correctness)))
                     if not correctness[i]]

    if len(misclassified) < 3:
        return None

    # Check if misclassifications cluster on specific predicted classes
    pred_counts = Counter(p for _, p, _ in misclassified)
    total_misc = len(misclassified)
    dominant_wrong = pred_counts.most_common(1)[0]

    if dominant_wrong[1] / total_misc > 0.4:
        return {
            "type": "class_confusion",
            "severity": "moderate",
            "title": f"Class {dominant_wrong[0]} Over-Prediction",
            "description": f"{dominant_wrong[1]}/{total_misc} misclassified nodes ({dominant_wrong[1]/total_misc*100:.0f}%) are incorrectly predicted as class {dominant_wrong[0]}.",
            "recommendation": f"Increase class weights for underrepresented classes or add class-balanced sampling.",
            "affected": f"class_{dominant_wrong[0]}",
        }

    return None


def _build_failure_summary(patterns: List[Dict], model_type: str) -> str:
    """Build a human-readable summary of failure patterns."""
    if not patterns:
        return f"{model_type} shows no significant failure patterns. Training appears healthy."

    high = [p for p in patterns if p["severity"] == "high"]
    moderate = [p for p in patterns if p["severity"] == "moderate"]

    parts = []
    if high:
        names = [p["title"] for p in high]
        parts.append(f"Critical issues: {', '.join(names)}.")
    if moderate:
        names = [p["title"] for p in moderate]
        parts.append(f"Moderate concerns: {', '.join(names)}.")

    if model_type == "GCN" and any(p["type"] == "over_smoothing" for p in patterns):
        parts.append("GCN's neighborhood aggregation is collapsing embeddings — consider reducing layers or adding skip connections.")
    elif model_type == "GAT" and any(p["type"] == "diffuse_attention" for p in patterns):
        parts.append("GAT's attention mechanism is not focusing effectively — the model may benefit from attention regularization.")
    elif model_type == "SAGE" and any(p["type"] == "sparse_neighborhood" for p in patterns):
        parts.append("GraphSAGE's sampling strategy may be too aggressive for sparse graph regions.")

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Dataset-Aware Analysis
# ---------------------------------------------------------------------------

def analyze_dataset_topology(graph_payload: Dict, snapshots: List[Dict] = None) -> Dict:
    """Analyze the dataset's topological properties."""
    if not graph_payload:
        return {"type": "unknown", "properties": {}}

    graph_data = {}
    if isinstance(graph_payload, dict):
        for candidate in (
            graph_payload.get("graph_data_json"),
            graph_payload.get("graph_data"),
            graph_payload,
        ):
            if isinstance(candidate, dict) and ("nodes" in candidate or "links" in candidate):
                graph_data = candidate
                break
    if not isinstance(graph_data, dict):
        return {"type": "unknown", "properties": {}}

    raw_nodes = graph_data.get("nodes", [])
    raw_links = graph_data.get("links", [])

    nodes = []
    for idx, node in enumerate(raw_nodes if isinstance(raw_nodes, list) else []):
        if isinstance(node, dict):
            nodes.append(node)
        else:
            nodes.append({"id": idx, "label": node})

    links = []
    for link in raw_links if isinstance(raw_links, list) else []:
        if isinstance(link, dict):
            links.append(link)
            continue
        if isinstance(link, (list, tuple)) and len(link) >= 2:
            links.append({"source": link[0], "target": link[1]})

    if not nodes:
        return {"type": "unknown", "properties": {}}

    n_nodes = len(nodes)
    n_edges = len(links)

    # Degree distribution
    degree_counter = Counter()
    for link in links:
        src = link.get("source", link.get("from", ""))
        tgt = link.get("target", link.get("to", ""))
        if isinstance(src, dict):
            src = src.get("id", src.get("index", ""))
        if isinstance(tgt, dict):
            tgt = tgt.get("id", tgt.get("index", ""))
        if src == "" or tgt == "" or src is None or tgt is None:
            continue
        degree_counter[src] += 1
        degree_counter[tgt] += 1

    degrees = list(degree_counter.values()) if degree_counter else [0]
    avg_degree = sum(degrees) / len(degrees) if degrees else 0
    max_degree = max(degrees) if degrees else 0

    # Density
    max_edges = n_nodes * (n_nodes - 1) / 2 if n_nodes > 1 else 1
    density = n_edges / max_edges if max_edges > 0 else 0

    # Class distribution
    class_counter = Counter()
    for node in nodes:
        gt = node.get("groundTruth", node.get("label", -1))
        class_counter[gt] += 1
    n_classes = len(class_counter)

    # Homophily estimation from last snapshot
    homophily = 0.5
    if snapshots:
        last_snap = snapshots[-1]
        majority_ratios = last_snap.get("majority_ratio", [])
        if majority_ratios:
            homophily = sum(majority_ratios) / len(majority_ratios)

    # Determine dataset type
    dataset_type = []
    if homophily > 0.7:
        dataset_type.append("homophilic")
    elif homophily < 0.4:
        dataset_type.append("heterophilic")
    else:
        dataset_type.append("mixed_homophily")

    if density < 0.01:
        dataset_type.append("sparse")
    elif density > 0.1:
        dataset_type.append("dense")

    if avg_degree < 3:
        dataset_type.append("low_connectivity")
    elif avg_degree > 10:
        dataset_type.append("high_connectivity")

    # Cluster coefficient estimation (simplified)
    clustering = 0
    if n_edges > 0 and n_nodes > 0:
        clustering = min(1.0, n_edges / (n_nodes * avg_degree / 2 + 1e-10))

    return {
        "type": "_".join(dataset_type),
        "properties": {
            "n_nodes": n_nodes,
            "n_edges": n_edges,
            "n_classes": n_classes,
            "avg_degree": round(avg_degree, 2),
            "max_degree": max_degree,
            "density": round(density, 6),
            "homophily_estimate": round(homophily, 4),
            "class_distribution": dict(class_counter),
            "class_balance": round(min(class_counter.values()) / max(class_counter.values()), 4) if class_counter else 0,
        },
        "recommendations": _dataset_recommendations(dataset_type, homophily, n_classes, avg_degree),
    }


def _dataset_recommendations(dataset_type: List[str], homophily: float, n_classes: int, avg_degree: float) -> List[str]:
    """Generate model recommendations based on dataset topology."""
    recs = []

    if "homophilic" in dataset_type:
        recs.append("This dataset is strongly homophilic — GCN and GraphSAGE are natural fits for neighborhood aggregation.")
        recs.append("GAT may provide marginal benefit over GCN since neighbors already share labels.")
    elif "heterophilic" in dataset_type:
        recs.append("This dataset is heterophilic — standard neighborhood aggregation may hurt. Consider GAT with learned attention or specialized heterophilic architectures.")
        recs.append("GraphSAGE with diverse sampling may handle heterophily better than GCN.")

    if "sparse" in dataset_type:
        recs.append("Sparse graph structure — models with wider receptive fields or residual connections help propagate information.")
        if avg_degree < 2:
            recs.append("Very low connectivity — consider adding virtual edges or using deeper architectures with skip connections.")

    if n_classes > 10:
        recs.append(f"Many classes ({n_classes}) — expect class confusion on similar categories. Consider hierarchical classification.")

    if "high_connectivity" in dataset_type:
        recs.append("High connectivity — over-smoothing risk is elevated. Keep GNN layers shallow (2-3 max).")

    return recs


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _safe_mean(values: List[float]) -> float:
    clean = [float(v) for v in values if isinstance(v, (int, float))]
    return sum(clean) / len(clean) if clean else 0.0


def _run_label(exp: Dict[str, Any], seen: Dict[str, int]) -> str:
    title = str(exp.get("title") or "").strip()
    model_type = str(exp.get("model_type") or "Unknown").strip()
    base = title or f"{model_type} run"
    count = seen.get(base, 0) + 1
    seen[base] = count
    return base if count == 1 else f"{base} ({count})"


def _history_scores(metrics: Dict[str, Any], snapshots: List[Dict[str, Any]], exp: Dict[str, Any]) -> List[float]:
    history = metrics.get("history", {}) if isinstance(metrics, dict) else {}
    primary = history.get("primary_score", [])
    scores = [float(v) for v in primary if isinstance(v, (int, float))]
    if scores:
        return scores

    fallback = []
    for snap in snapshots or []:
        for key in ("val_acc", "accuracy", "graph_accuracy", "macro_f1"):
            value = snap.get(key)
            if isinstance(value, (int, float)):
                fallback.append(float(value))
                break
    if fallback:
        return fallback

    accuracy = exp.get("accuracy")
    return [float(accuracy)] if isinstance(accuracy, (int, float)) else []


def _build_run_assessment(
    exp: Dict[str, Any],
    metrics: Dict[str, Any],
    snapshots: List[Dict[str, Any]],
    graph_payload: Optional[Dict[str, Any]],
    label: str,
) -> Dict[str, Any]:
    model_type = exp.get("model_type", "Unknown")
    diagnostics = compute_structural_diagnostics(snapshots, graph_payload, model_type)
    scores = _history_scores(metrics, snapshots, exp)
    final_score = scores[-1] if scores else float(exp.get("accuracy") or 0.0)
    best_score = max(scores) if scores else final_score
    best_epoch = scores.index(best_score) if scores else int(exp.get("best_epoch") or 0)

    if scores:
        target = best_score * 0.95 if best_score > 0 else 0
        convergence_epoch = next((i for i, value in enumerate(scores) if value >= target), len(scores) - 1)
        peak_tail = scores[int(len(scores) * 0.9):] or [scores[-1]]
        overfit_decline = max(best_score - _safe_mean(peak_tail), 0.0)
    else:
        convergence_epoch = int(exp.get("best_epoch") or 0)
        overfit_decline = 0.0

    epoch_count = max(len(scores), len(snapshots), 1)
    stability_score = float(diagnostics.get("stability_score", {}).get("score") or 0.5)
    boundary = diagnostics.get("boundary_accuracy", {})
    boundary_score = float(boundary.get("score") or 0.6) if boundary.get("boundary_count", 0) else 0.6
    overfit_gap = float(diagnostics.get("overfitting_risk", {}).get("gap") or 0.0)
    smoothing_risk = diagnostics.get("over_smoothing_risk", {}).get("risk") or "unknown"
    convergence_score = 1.0 - (convergence_epoch / max(epoch_count - 1, 1))
    overfit_penalty = min(overfit_decline * 4.0, 0.6)
    generalization_score = max(0.0, 1.0 - min(overfit_gap * 3.0 + overfit_penalty, 1.0))
    performance_score = _clamp(best_score)

    composite = (
        performance_score * 0.45
        + stability_score * 0.2
        + convergence_score * 0.15
        + generalization_score * 0.1
        + boundary_score * 0.1
    )

    strengths = []
    if convergence_score >= 0.75:
        strengths.append("fast_start")
    if stability_score >= 0.8:
        strengths.append("stable_finish")
    if boundary_score >= 0.7:
        strengths.append("boundary_ready")
    if generalization_score >= 0.75:
        strengths.append("low_overfit_risk")

    caution = "healthy"
    if smoothing_risk in {"high", "moderate"}:
        caution = "over_smoothing"
    elif overfit_gap >= 0.12 or overfit_decline >= 0.04:
        caution = "overfitting"
    elif stability_score < 0.55:
        caution = "unstable"
    elif boundary.get("label") == "weak":
        caution = "boundary"

    return {
        "experiment_id": exp.get("id"),
        "label": label,
        "title": exp.get("title") or label,
        "model_type": model_type,
        "accuracy": round(float(exp.get("accuracy") or final_score), 4),
        "loss": round(float(exp.get("loss") or 0.0), 4),
        "best_score": round(best_score, 4),
        "best_epoch": int(best_epoch),
        "epoch_count": epoch_count,
        "convergence_epoch": int(convergence_epoch),
        "overfit_decline": round(overfit_decline, 4),
        "stability_score": round(stability_score, 4),
        "boundary_score": round(boundary_score, 4),
        "generalization_score": round(generalization_score, 4),
        "composite_score": round(composite * 100, 1),
        "strengths": strengths,
        "caution": caution,
        "diagnostics": diagnostics,
    }


def _comparison_copy(lang: str) -> Dict[str, Any]:
    if lang == "vi":
        return {
            "select_runs": "Chọn ít nhất 2 phiên để AI có thể so sánh.",
            "insufficient": "Chưa đủ tín hiệu để kết luận rõ ràng.",
            "winner_title": "Overall Recommendation",
            "convergence_title": "Convergence Trade-Off",
            "stability_title": "Training Stability",
            "risk_title": "Generalization Risk",
            "dataset_fit_title": "Dataset-Model Compatibility",
            "winner_finding": "{winner} hiện là lựa chọn đáng tin nhất với điểm tổng hợp {score}/100, nhỉnh hơn {runner_up} nhờ chất lượng tốt hơn và quỹ đạo huấn luyện an toàn hơn.",
            "winner_details": [
                "{label}: điểm tổng hợp {score}/100, best score {best_score:.1%}, ổn định {stability:.0%}, tổng quát hóa {generalization:.0%}.",
            ],
            "winner_recommendation": "Ưu tiên dùng {winner} làm mốc chính, sau đó tinh chỉnh thêm theo cảnh báo lớn nhất của nó.",
            "tight_race": "Khoảng cách giữa hai phiên đầu chỉ là {gap:.1f} điểm, nên nên xác nhận thêm bằng replay và report trước khi chốt.",
            "convergence_finding": "{fastest} vào form sớm nhất ở epoch {fastest_epoch}, còn {slowest} cần tới epoch {slowest_epoch}. Nếu cần thử nghiệm nhanh, {fastest} là baseline gọn hơn.",
            "stability_finding": "{stable} có pha cuối ổn định nhất (CV thấp hơn), trong khi {fragile} dao động mạnh hơn và dễ tạo cảm giác kết quả đẹp nhưng khó lặp lại.",
            "risk_finding_overfit": "{risky} đang có rủi ro quá khớp rõ hơn: điểm tốt nhất xuất hiện sớm nhưng giảm {decline:.1%} về cuối, nên không nên đọc riêng mỗi điểm đỉnh.",
            "risk_finding_safe": "{safe} giữ được độ tổng quát hóa tốt nhất trong nhóm, nên phù hợp hơn nếu mục tiêu là chọn mô hình để triển khai hoặc làm mốc so sánh.",
            "dataset_fit_homophily": "Dữ liệu có homophily cao ({homophily:.2f}), nên các mô hình gom lân cận đều được lợi. Hãy ưu tiên phiên nào vừa ổn định vừa ít overfitting hơn.",
            "dataset_fit_heterophily": "Dữ liệu có xu hướng heterophily ({homophily:.2f}), nên attention hoặc cơ chế lấy mẫu chọn lọc sẽ đáng giá hơn việc chỉ làm mượt lân cận.",
            "summary_single_winner": "{winner} hiện là lựa chọn tốt nhất vì vừa đạt chất lượng cao hơn vừa an toàn hơn ở cuối quá trình train.",
            "summary_tradeoff": "{winner} đang dẫn đầu, nhưng {runner_up} bám khá sát. Điểm khác biệt chính nằm ở độ ổn định và rủi ro quá khớp chứ không chỉ ở score cuối.",
            "summary_fast_baseline": "{fastest} vẫn là baseline vào form nhanh nhất nếu bạn cần lặp thử nghiệm gọn.",
            "next_promote": "Dùng {winner} làm phiên chuẩn để replay, pin và so với các biến thể mới.",
            "next_early_stop": "Thử early stopping quanh epoch {epoch} cho {label} để tránh mất chất lượng về cuối.",
            "next_regularize": "Tăng regularization hoặc giảm độ sâu cho {label} trước khi kết luận mô hình này yếu hơn hẳn.",
            "next_verify_close": "Hai phiên dẫn đầu đang sát nhau, nên kiểm tra thêm report chi tiết và confusion/failure view trước khi chốt.",
            "reason_over_smoothing": "Cần theo dõi over-smoothing",
            "reason_overfitting": "Cần chặn overfitting về cuối",
            "reason_unstable": "Cần làm mượt quỹ đạo train",
            "reason_boundary": "Còn yếu ở các điểm khó / biên",
            "reason_healthy": "Có thể dùng làm mốc so sánh tiếp theo",
        }
    return {
        "select_runs": "Select at least 2 runs to compare.",
        "insufficient": "Not enough signal to produce a confident conclusion yet.",
        "winner_title": "Overall Recommendation",
        "convergence_title": "Convergence Trade-Off",
        "stability_title": "Training Stability",
        "risk_title": "Generalization Risk",
        "dataset_fit_title": "Dataset-Model Compatibility",
        "winner_finding": "{winner} is the most reliable choice right now with a composite score of {score}/100, edging out {runner_up} through a stronger quality-to-risk balance.",
        "winner_details": [
            "{label}: composite {score}/100, best score {best_score:.1%}, stability {stability:.0%}, generalization {generalization:.0%}.",
        ],
        "winner_recommendation": "Use {winner} as the current reference run, then tune against its biggest remaining risk.",
        "tight_race": "The top two runs are only {gap:.1f} points apart, so confirm with replay and report reading before final promotion.",
        "convergence_finding": "{fastest} reaches form earliest at epoch {fastest_epoch}, while {slowest} needs until epoch {slowest_epoch}. If you need a quick iteration baseline, {fastest} is the cleaner starting point.",
        "stability_finding": "{stable} has the calmest late-stage trajectory, while {fragile} shows more variance and is harder to trust run-to-run.",
        "risk_finding_overfit": "{risky} shows the clearest overfitting signal: it peaks early and gives back {decline:.1%} near the end, so the peak score alone is misleading.",
        "risk_finding_safe": "{safe} preserves the best generalization profile in this group, making it safer for promotion or future comparisons.",
        "dataset_fit_homophily": "This dataset is strongly homophilic ({homophily:.2f}), so neighborhood aggregation is naturally rewarded. Prefer the run that stays stable instead of only chasing the top score.",
        "dataset_fit_heterophily": "This dataset leans heterophilic ({homophily:.2f}), so selective attention or sampling matters more than pure smoothing.",
        "summary_single_winner": "{winner} is the best current choice because it combines stronger quality with a safer late-training profile.",
        "summary_tradeoff": "{winner} is leading, but {runner_up} is still close. The real separator is stability and overfitting risk, not just the headline score.",
        "summary_fast_baseline": "{fastest} still gives the quickest baseline if you need fast iteration.",
        "next_promote": "Promote {winner} as the reference run for replay, pinning, and future challenger comparisons.",
        "next_early_stop": "Try early stopping around epoch {epoch} for {label} to avoid late-stage regression.",
        "next_regularize": "Increase regularization or reduce depth for {label} before concluding that this architecture is fundamentally weaker.",
        "next_verify_close": "The top runs are still close, so review the detailed report and failure slices before making a final call.",
        "reason_over_smoothing": "Watch for over-smoothing",
        "reason_overfitting": "Control late-stage overfitting",
        "reason_unstable": "Smooth the training trajectory",
        "reason_boundary": "Still weak on hard boundary cases",
        "reason_healthy": "Good candidate for the next reference run",
    }


# ---------------------------------------------------------------------------
# AI Insight Generation
# ---------------------------------------------------------------------------

def generate_comparison_insights(results: List[Dict], graph_payload: Dict = None, lang: str = "en") -> Dict:
    """Generate AI-powered comparison insights for multiple experiment runs."""
    copy = _comparison_copy(lang)
    if not results or len(results) < 2:
        return {"insights": [], "summary": copy["select_runs"], "leaderboard": [], "next_steps": []}

    seen_labels: Dict[str, int] = {}
    assessments = []
    for result in results:
        exp = result.get("experiment", {})
        label = _run_label(exp, seen_labels)
        assessments.append(
            _build_run_assessment(
                exp=exp,
                metrics=result.get("metrics", {}) or {},
                snapshots=result.get("snapshots", []) or [],
                graph_payload=graph_payload,
                label=label,
            )
        )

    assessments.sort(key=lambda item: item["composite_score"], reverse=True)
    winner = assessments[0]
    runner_up = assessments[1] if len(assessments) > 1 else winner
    score_gap = winner["composite_score"] - runner_up["composite_score"]
    fastest = min(assessments, key=lambda item: item["convergence_epoch"])
    slowest = max(assessments, key=lambda item: item["convergence_epoch"])
    most_stable = max(assessments, key=lambda item: item["stability_score"])
    least_stable = min(assessments, key=lambda item: item["stability_score"])
    safest = max(assessments, key=lambda item: item["generalization_score"])
    riskiest = max(assessments, key=lambda item: item["overfit_decline"] + (1 - item["generalization_score"]))

    caution_reason_map = {
        "over_smoothing": copy["reason_over_smoothing"],
        "overfitting": copy["reason_overfitting"],
        "unstable": copy["reason_unstable"],
        "boundary": copy["reason_boundary"],
        "healthy": copy["reason_healthy"],
    }

    leaderboard = []
    for index, item in enumerate(assessments, start=1):
        leaderboard.append({
            "rank": index,
            "experiment_id": item["experiment_id"],
            "label": item["label"],
            "title": item["title"],
            "model_type": item["model_type"],
            "composite_score": item["composite_score"],
            "best_score": item["best_score"],
            "stability_score": item["stability_score"],
            "generalization_score": item["generalization_score"],
            "caution": item["caution"],
            "reason": caution_reason_map.get(item["caution"], copy["reason_healthy"]),
        })

    insights = [{
        "type": "performance",
        "title": copy["winner_title"],
        "finding": copy["winner_finding"].format(
            winner=winner["label"],
            score=winner["composite_score"],
            runner_up=runner_up["label"],
        ),
        "details": [
            copy["winner_details"][0].format(
                label=item["label"],
                score=item["composite_score"],
                best_score=item["best_score"],
                stability=item["stability_score"],
                generalization=item["generalization_score"],
            )
            for item in assessments[:3]
        ],
        "recommendation": copy["winner_recommendation"].format(winner=winner["label"]),
        "significance": "high" if score_gap >= 4 else "moderate",
    }]

    if score_gap <= 3:
        insights[0]["details"].append(copy["tight_race"].format(gap=score_gap))

    insights.append({
        "type": "convergence",
        "title": copy["convergence_title"],
        "finding": copy["convergence_finding"].format(
            fastest=fastest["label"],
            fastest_epoch=fastest["convergence_epoch"],
            slowest=slowest["label"],
            slowest_epoch=slowest["convergence_epoch"],
        ),
        "details": [
            f"{item['label']}: epoch {item['convergence_epoch']} / {item['epoch_count'] - 1}"
            for item in assessments
        ],
        "significance": "high" if slowest["convergence_epoch"] - fastest["convergence_epoch"] >= 4 else "moderate",
    })

    insights.append({
        "type": "stability",
        "title": copy["stability_title"],
        "finding": copy["stability_finding"].format(
            stable=most_stable["label"],
            fragile=least_stable["label"],
        ),
        "details": [
            f"{item['label']}: stability {item['stability_score']:.0%}"
            for item in sorted(assessments, key=lambda entry: entry["stability_score"], reverse=True)
        ],
        "significance": "high" if most_stable["stability_score"] - least_stable["stability_score"] >= 0.2 else "moderate",
    })

    if riskiest["overfit_decline"] >= 0.02 or riskiest["caution"] == "overfitting":
        risk_finding = copy["risk_finding_overfit"].format(
            risky=riskiest["label"],
            decline=riskiest["overfit_decline"],
        )
    else:
        risk_finding = copy["risk_finding_safe"].format(safe=safest["label"])
    insights.append({
        "type": "overfitting",
        "title": copy["risk_title"],
        "finding": risk_finding,
        "details": [
            f"{item['label']}: generalization {item['generalization_score']:.0%}, decline {item['overfit_decline']:.1%}"
            for item in sorted(assessments, key=lambda entry: entry["generalization_score"], reverse=True)
        ],
        "significance": "high" if riskiest["caution"] in {"overfitting", "over_smoothing"} else "moderate",
    })

    if graph_payload:
        topo = analyze_dataset_topology(graph_payload)
        props = topo.get("properties", {})
        homophily = float(props.get("homophily_estimate", 0.5) or 0.5)
        if homophily > 0.7:
            finding = copy["dataset_fit_homophily"].format(homophily=homophily)
        elif homophily < 0.4:
            finding = copy["dataset_fit_heterophily"].format(homophily=homophily)
        else:
            finding = ""
        if finding:
            insights.append({
                "type": "dataset_fit",
                "title": copy["dataset_fit_title"],
                "finding": finding,
                "significance": "moderate",
            })

    summary_parts = []
    if score_gap >= 4:
        summary_parts.append(copy["summary_single_winner"].format(winner=winner["label"]))
    else:
        summary_parts.append(copy["summary_tradeoff"].format(winner=winner["label"], runner_up=runner_up["label"]))
    if fastest["label"] != winner["label"]:
        summary_parts.append(copy["summary_fast_baseline"].format(fastest=fastest["label"]))

    next_steps = [copy["next_promote"].format(winner=winner["label"])]
    if riskiest["caution"] == "overfitting":
        next_steps.append(copy["next_early_stop"].format(epoch=riskiest["best_epoch"], label=riskiest["label"]))
    if riskiest["caution"] in {"over_smoothing", "unstable"}:
        next_steps.append(copy["next_regularize"].format(label=riskiest["label"]))
    if score_gap <= 3:
        next_steps.append(copy["next_verify_close"])

    return {
        "insights": insights,
        "insight_count": len(insights),
        "summary": " ".join(part for part in summary_parts if part).strip() or copy["insufficient"],
        "models_analyzed": [item["model_type"] for item in assessments],
        "leaderboard": leaderboard,
        "winner": {
            "experiment_id": winner["experiment_id"],
            "label": winner["label"],
            "title": winner["title"],
            "model_type": winner["model_type"],
            "composite_score": winner["composite_score"],
            "reason": caution_reason_map.get(winner["caution"], copy["reason_healthy"]),
        },
        "next_steps": next_steps,
    }


# ---------------------------------------------------------------------------
# Recommendation Engine
# ---------------------------------------------------------------------------

def generate_recommendations(
    snapshots: List[Dict],
    model_type: str = "GCN",
    config: Dict = None,
    graph_payload: Dict = None,
    lang: str = "en",
) -> Dict:
    """Generate actionable recommendations for improving the experiment."""
    if not snapshots:
        return {"recommendations": [], "summary": "No training data available for recommendations."}

    config = config or {}
    diagnostics = compute_structural_diagnostics(snapshots, graph_payload, model_type)
    failures = analyze_failure_patterns(snapshots, graph_payload, model_type)
    recs = []

    # Over-smoothing recommendations
    smoothing = diagnostics.get("over_smoothing_risk", {})
    if smoothing.get("risk") in ("high", "moderate"):
        recs.append({
            "priority": "high",
            "category": "architecture",
            "action": "Add residual connections or reduce GNN layers",
            "reason": f"Over-smoothing risk is {smoothing['risk']} (energy collapsed to {smoothing['collapse_ratio']*100:.1f}% of initial).",
            "expected_impact": "Preserve node distinction while maintaining neighborhood information.",
        })

    # Overfitting recommendations
    overfit = diagnostics.get("overfitting_risk", {})
    if overfit.get("risk") == "high":
        current_dropout = config.get("dropout", 0.5)
        recs.append({
            "priority": "high",
            "category": "regularization",
            "action": f"Increase dropout from {current_dropout} to {min(0.8, current_dropout + 0.15)} or add weight decay",
            "reason": f"Train-val gap is {overfit['gap']*100:.1f}% and widening.",
            "expected_impact": "Reduce memorization and improve generalization.",
        })

    # Convergence recommendations
    convergence = diagnostics.get("convergence_speed", {})
    if convergence.get("speed") == "slow":
        current_lr = config.get("lr", 0.01)
        recs.append({
            "priority": "moderate",
            "category": "optimization",
            "action": f"Try higher learning rate (current: {current_lr}) or learning rate scheduling",
            "reason": f"Model takes {convergence['epoch']} epochs to reach 95% of best score.",
            "expected_impact": "Faster convergence without sacrificing final performance.",
        })

    # GAT-specific recommendations
    if model_type == "GAT":
        attention = diagnostics.get("attention_focus_score", {})
        if attention.get("label") == "diffuse":
            recs.append({
                "priority": "moderate",
                "category": "architecture",
                "action": "Reduce attention heads or add attention entropy regularization",
                "reason": "Attention weights remain diffuse — the model is not learning to focus on informative neighbors.",
                "expected_impact": "More discriminative neighbor selection.",
            })

        head_diversity = diagnostics.get("attention_head_diversity", {})
        if head_diversity.get("label") == "redundant":
            recs.append({
                "priority": "low",
                "category": "architecture",
                "action": "Increase GAT heads to capture diverse attention patterns",
                "reason": "Current heads are redundant (high similarity between head distributions).",
                "expected_impact": "Richer feature extraction from different attention perspectives.",
            })

    # Stability recommendations
    stability = diagnostics.get("stability_score", {})
    if stability.get("label") == "unstable":
        current_lr = config.get("lr", 0.01)
        recs.append({
            "priority": "moderate",
            "category": "optimization",
            "action": f"Reduce learning rate (current: {current_lr}) or add gradient clipping",
            "reason": f"Training is unstable (CV={stability.get('cv', 0):.4f}).",
            "expected_impact": "Smoother training trajectory and more reliable convergence.",
        })

    # Boundary accuracy recommendations
    boundary = diagnostics.get("boundary_accuracy", {})
    if boundary.get("label") == "weak" and boundary.get("boundary_count", 0) > 0:
        recs.append({
            "priority": "high",
            "category": "model_selection",
            "action": "Switch to GAT or add edge features for boundary node handling",
            "reason": f"Only {boundary['score']*100:.1f}% of boundary nodes are correctly classified.",
            "expected_impact": "Better class boundary discrimination.",
        })

    # Embedding separation recommendations
    separation = diagnostics.get("embedding_separation", {})
    if separation.get("label") == "overlapping":
        recs.append({
            "priority": "moderate",
            "category": "loss_function",
            "action": "Add contrastive loss or increase hidden dimension",
            "reason": f"Inter/intra-class distance ratio is only {separation.get('ratio', 0):.2f}.",
            "expected_impact": "Better class separation in latent space.",
        })

    # Dataset-aware recommendations
    if graph_payload:
        topo = analyze_dataset_topology(graph_payload, snapshots)
        topo_recs = topo.get("recommendations", [])
        for tr in topo_recs:
            recs.append({
                "priority": "low",
                "category": "dataset",
                "action": tr,
                "reason": "Based on dataset topology analysis.",
                "expected_impact": "Better model-dataset compatibility.",
            })

    # Sort by priority
    priority_order = {"high": 0, "moderate": 1, "low": 2}
    recs.sort(key=lambda r: priority_order.get(r.get("priority", "low"), 3))

    summary_parts = []
    high_recs = [r for r in recs if r["priority"] == "high"]
    if high_recs:
        summary_parts.append(f"Top priority: {high_recs[0]['action']}.")
    if len(recs) > 1:
        summary_parts.append(f"{len(recs)} total recommendations across {len(set(r['category'] for r in recs))} categories.")
    else:
        summary_parts.append("Training looks healthy — no major improvements needed.")

    result = {
        "recommendations": recs,
        "recommendation_count": len(recs),
        "priority_counts": {
            "high": sum(1 for r in recs if r["priority"] == "high"),
            "moderate": sum(1 for r in recs if r["priority"] == "moderate"),
            "low": sum(1 for r in recs if r["priority"] == "low"),
        },
        "summary": " ".join(summary_parts),
        "source": "heuristic",
        "llm": llm_analyst_service.get_public_status(),
    }
    llm_result = llm_analyst_service.generate_recommendation_brief(
        snapshots=snapshots,
        model_type=model_type,
        config=config,
        graph_payload=graph_payload,
        heuristic_payload=result,
        lang=lang,
    )
    if llm_result:
        result.update(llm_result)
    return result


# ---------------------------------------------------------------------------
# Model Personality / Behavior Layer
# ---------------------------------------------------------------------------

MODEL_PROFILES = {
    "GCN": {
        "name": "GCN",
        "personality": "Fast & Stable",
        "strengths": ["Fast convergence", "Clean baseline behavior", "Efficient neighborhood aggregation"],
        "weaknesses": ["Over-smoothing in deep architectures", "Struggles on bridge/boundary nodes", "No learned attention"],
        "best_for": ["Homophilic graphs", "Shallow architectures (2-3 layers)", "Large-scale graphs with clear community structure"],
        "behavior": "GCN applies symmetric normalization across all neighbors equally. It excels when neighbors share labels (homophily) but treats all edges equally, making it vulnerable to noisy or heterophilic connections.",
    },
    "GAT": {
        "name": "GAT",
        "personality": "Expressive but Unstable",
        "strengths": ["Learned attention weights", "Better boundary node handling", "Multi-head feature extraction"],
        "weaknesses": ["Higher variance across runs", "Attention can remain diffuse", "Computationally expensive"],
        "best_for": ["Heterophilic graphs", "Graphs with important edge distinctions", "Tasks requiring interpretable attention"],
        "behavior": "GAT learns to weight neighbor importance via attention. When attention focuses correctly, it outperforms GCN on hard cases. However, attention can fail to converge to meaningful patterns, especially on small or noisy graphs.",
    },
    "SAGE": {
        "name": "GraphSAGE",
        "personality": "Scalable & Balanced",
        "strengths": ["Inductive capability", "Sampling-based scalability", "Balanced neighborhood aggregation"],
        "weaknesses": ["Sampling variance on sparse graphs", "May miss rare neighbor patterns", "Smoother learning curves (moving average effect)"],
        "best_for": ["Large graphs requiring mini-batch training", "Inductive settings (new nodes)", "Medium-homophily datasets"],
        "behavior": "GraphSAGE samples and aggregates neighbor features, enabling training on large graphs. Its sampling introduces variance but also acts as regularization. It provides a balanced trade-off between GCN's simplicity and GAT's expressiveness.",
    },
}


def get_model_profile(model_type: str) -> Dict:
    """Get the behavioral profile for a model type."""
    return MODEL_PROFILES.get(model_type, {
        "name": model_type,
        "personality": "Unknown",
        "strengths": [],
        "weaknesses": [],
        "best_for": [],
        "behavior": "No profile available for this model type.",
    })


def _resolve_dataset_label(config: Dict[str, Any]) -> str:
    """Return a readable dataset label for research-note summaries."""
    config = config or {}
    for key in ("dataset", "dataset_name"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "current dataset"


def _has_meaningful_dataset_context(props: Dict[str, Any]) -> bool:
    """Guard against empty topology payloads surfacing as zeroed dataset context."""
    if not isinstance(props, dict):
        return False
    return bool(props.get("n_nodes") or props.get("n_edges") or props.get("n_classes"))


# ---------------------------------------------------------------------------
# Research Notes Auto-Generation
# ---------------------------------------------------------------------------

def generate_research_notes(
    snapshots: List[Dict],
    model_type: str = "GCN",
    config: Dict = None,
    graph_payload: Dict = None,
) -> Dict:
    """Auto-generate research notes for a completed experiment run."""
    if not snapshots:
        return {"notes": "Insufficient data for research notes.", "sections": []}

    config = config or {}
    diagnostics = compute_structural_diagnostics(snapshots, graph_payload, model_type)
    failures = analyze_failure_patterns(snapshots, graph_payload, model_type)
    profile = get_model_profile(model_type)

    last_snap = snapshots[-1]
    val_acc = last_snap.get("val_acc", 0)
    train_loss = last_snap.get("train_loss", 0)
    dataset_label = _resolve_dataset_label(config)

    sections = []

    # Summary section
    sections.append({
        "title": "Summary",
        "content": f"{model_type} trained for {len(snapshots)} epochs on {dataset_label} dataset. "
                   f"Final validation accuracy: {val_acc*100:.1f}%, training loss: {train_loss:.4f}. "
                   f"Best epoch: {diagnostics.get('convergence_speed', {}).get('epoch', 'N/A')}.",
    })

    # Observations section
    observations = []
    stability = diagnostics.get("stability_score", {})
    if stability.get("label"):
        observations.append(f"Training stability: {stability['label']} (CV={stability.get('cv', 'N/A')}).")

    overfit = diagnostics.get("overfitting_risk", {})
    if overfit.get("label"):
        observations.append(f"Overfitting assessment: {overfit['label']} (gap={overfit.get('gap', 0)*100:.1f}%).")

    smoothing = diagnostics.get("over_smoothing_risk", {})
    if smoothing.get("label"):
        observations.append(f"Over-smoothing: {smoothing['label']} (energy at {smoothing.get('collapse_ratio', 0)*100:.1f}% of initial).")

    boundary = diagnostics.get("boundary_accuracy", {})
    if boundary.get("boundary_count", 0) > 0:
        observations.append(f"Boundary accuracy: {boundary['score']*100:.1f}% on {boundary['boundary_count']} boundary nodes.")

    if observations:
        sections.append({"title": "Observations", "content": " ".join(observations)})

    # Possible causes
    if failures.get("patterns"):
        causes = [f"- {p['title']}: {p['description']}" for p in failures["patterns"]]
        sections.append({"title": "Possible Causes", "content": "\n".join(causes)})

    # Dataset context
    if graph_payload:
        topo = analyze_dataset_topology(graph_payload, snapshots)
        props = topo.get("properties", {})
        if _has_meaningful_dataset_context(props):
            topo_desc = (
                f"Dataset has {props.get('n_nodes', 0)} nodes, {props.get('n_edges', 0)} edges, "
                f"{props.get('n_classes', 0)} classes. "
                f"Estimated homophily: {props.get('homophily_estimate', 0):.2f}. "
                f"Average degree: {props.get('avg_degree', 0):.1f}."
            )
            sections.append({"title": "Dataset Context", "content": topo_desc})

    # Suggested next experiments
    next_experiments = []
    if smoothing.get("risk") in ("high", "moderate"):
        next_experiments.append("Try reducing GNN layers or adding residual connections to combat over-smoothing.")
    if overfit.get("risk") == "high":
        next_experiments.append("Increase regularization (dropout, weight decay) or use early stopping.")
    if model_type == "GCN" and boundary.get("label") == "weak":
        next_experiments.append("Compare with GAT to see if attention helps on boundary nodes.")
    if model_type == "GAT":
        next_experiments.append("Try different numbers of attention heads (2, 4, 8) to find the optimal configuration.")
    if not next_experiments:
        next_experiments.append("Compare this run with other model architectures on the same dataset.")
        next_experiments.append("Try different hidden dimensions (32, 64, 128) to find the sweet spot.")

    sections.append({"title": "Suggested Next Experiments", "content": "\n".join(f"- {e}" for e in next_experiments)})

    # Build full notes
    notes = "\n\n".join(f"## {s['title']}\n{s['content']}" for s in sections)

    result = {
        "notes": notes,
        "sections": sections,
        "generated_at": "auto",
        "source": "heuristic",
        "llm": llm_analyst_service.get_public_status(),
    }
    llm_result = llm_analyst_service.generate_research_notes(
        snapshots=snapshots,
        model_type=model_type,
        config=config,
        graph_payload=graph_payload,
        heuristic_payload=result,
    )
    if llm_result:
        result.update(llm_result)
    return result
