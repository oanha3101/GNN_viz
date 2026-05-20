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

    current_gap = gaps[-1] if gaps else 0

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

    graph_data = graph_payload.get("graph_data_json", {})
    nodes = graph_data.get("nodes", [])
    links = graph_data.get("links", [])

    if not nodes:
        return {"type": "unknown", "properties": {}}

    n_nodes = len(nodes)
    n_edges = len(links)

    # Degree distribution
    degree_counter = Counter()
    for link in links:
        src = link.get("source", link.get("from", ""))
        tgt = link.get("target", link.get("to", ""))
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


# ---------------------------------------------------------------------------
# AI Insight Generation
# ---------------------------------------------------------------------------

def generate_comparison_insights(results: List[Dict], graph_payload: Dict = None) -> Dict:
    """Generate AI-powered comparison insights for multiple experiment runs."""
    if not results or len(results) < 2:
        return {"insights": [], "summary": "Select at least 2 runs to generate comparison insights."}

    insights = []

    models = []
    for r in results:
        exp = r.get("experiment", {})
        metrics = r.get("metrics", {})
        snapshots = r.get("snapshots", [])
        model = {
            "id": exp.get("id"),
            "model_type": exp.get("model_type", "Unknown"),
            "accuracy": exp.get("accuracy", 0),
            "loss": exp.get("loss", 0),
            "best_epoch": exp.get("best_epoch", 0),
            "history": metrics.get("history", {}),
        }
        models.append(model)

    # Convergence comparison
    convergence_models = []
    for m in models:
        scores = m["history"].get("primary_score", [])
        if not scores:
            continue
        best = max(scores)
        target = best * 0.95
        conv_epoch = next((i for i, s in enumerate(scores) if s >= target), len(scores) - 1)
        convergence_models.append({"model": m["model_type"], "epoch": conv_epoch, "id": m["id"]})

    if convergence_models:
        fastest = min(convergence_models, key=lambda x: x["epoch"])
        slowest = max(convergence_models, key=lambda x: x["epoch"])
        insights.append({
            "type": "convergence",
            "title": "Convergence Speed",
            "finding": f"{fastest['model']} converges fastest (epoch {fastest['epoch']}), while {slowest['model']} takes longest (epoch {slowest['epoch']}).",
            "details": [f"{m['model']}: reaches 95% best at epoch {m['epoch']}" for m in sorted(convergence_models, key=lambda x: x["epoch"])],
            "significance": "high" if fastest["epoch"] < slowest["epoch"] * 0.5 else "moderate",
        })

    # Stability comparison
    stability_models = []
    for m in models:
        scores = m["history"].get("primary_score", [])
        if len(scores) < 5:
            continue
        tail = scores[int(len(scores) * 0.7):]
        if not tail:
            continue
        mean = sum(tail) / len(tail)
        var = sum((x - mean) ** 2 for x in tail) / len(tail)
        cv = math.sqrt(var) / (mean + 1e-10)
        stability_models.append({"model": m["model_type"], "cv": cv, "id": m["id"]})

    if stability_models:
        most_stable = min(stability_models, key=lambda x: x["cv"])
        least_stable = max(stability_models, key=lambda x: x["cv"])
        insights.append({
            "type": "stability",
            "title": "Training Stability",
            "finding": f"{most_stable['model']} is most stable (CV={most_stable['cv']:.4f}), while {least_stable['model']} shows more variance (CV={least_stable['cv']:.4f}).",
            "details": [f"{m['model']}: coefficient of variation = {m['cv']:.4f}" for m in sorted(stability_models, key=lambda x: x["cv"])],
            "significance": "high" if most_stable["cv"] < least_stable["cv"] * 0.3 else "moderate",
        })

    # Overfitting comparison
    overfit_models = []
    for m in models:
        scores = m["history"].get("primary_score", [])
        if len(scores) < 5:
            continue
        last_10pct = scores[int(len(scores) * 0.9):]
        peak = max(scores)
        decline = peak - (sum(last_10pct) / len(last_10pct) if last_10pct else peak)
        overfit_models.append({"model": m["model_type"], "decline": decline, "peak_epoch": scores.index(peak), "total_epochs": len(scores), "id": m["id"]})

    for om in overfit_models:
        if om["decline"] > 0.05 and om["peak_epoch"] < om["total_epochs"] * 0.8:
            insights.append({
                "type": "overfitting",
                "title": f"{om['model']} Overfitting Signal",
                "finding": f"{om['model']} peaked at epoch {om['peak_epoch']} then declined by {om['decline']*100:.1f}%. Suggests overfitting in later epochs.",
                "recommendation": "Consider early stopping around the peak epoch.",
                "significance": "moderate",
            })

    # Best performer
    best_model = max(models, key=lambda x: x["accuracy"])
    worst_model = min(models, key=lambda x: x["accuracy"])
    acc_gap = best_model["accuracy"] - worst_model["accuracy"]

    insights.append({
        "type": "performance",
        "title": "Best Performer",
        "finding": f"{best_model['model_type']} achieves the highest accuracy ({best_model['accuracy']*100:.1f}%), leading {worst_model['model_type']} by {acc_gap*100:.1f}%.",
        "details": [f"{m['model_type']}: {m['accuracy']*100:.1f}% accuracy, {m['loss']:.4f} loss" for m in sorted(models, key=lambda x: -x["accuracy"])],
        "significance": "high" if acc_gap > 0.05 else "moderate",
    })

    # Dataset-aware analysis
    if graph_payload:
        topo = analyze_dataset_topology(graph_payload)
        props = topo.get("properties", {})
        homophily = props.get("homophily_estimate", 0.5)

        if homophily > 0.7:
            favor = "GCN" if any(m["model_type"] == "GCN" for m in models) else "neighborhood aggregation models"
            insights.append({
                "type": "dataset_fit",
                "title": "Dataset-Model Compatibility",
                "finding": f"This dataset exhibits strong homophily ({homophily:.2f}), naturally favoring {favor}. The high neighbor-label agreement means simple aggregation captures class structure well.",
                "significance": "high",
            })
        elif homophily < 0.4:
            insights.append({
                "type": "dataset_fit",
                "title": "Heterophilic Challenge",
                "finding": f"This dataset is heterophilic (homophily={homophily:.2f}). Standard neighborhood aggregation may mix dissimilar features. GAT's attention or specialized heterophilic models may perform better.",
                "significance": "high",
            })

    # Generate narrative summary
    summary_parts = []
    if best_model:
        summary_parts.append(f"{best_model['model_type']} currently achieves the best balance between validation accuracy and training stability.")
    if convergence_models:
        fastest = min(convergence_models, key=lambda x: x["epoch"])
        summary_parts.append(f"{fastest['model']} converges the fastest and provides the cleanest baseline behavior.")
    if stability_models:
        most_stable = min(stability_models, key=lambda x: x["cv"])
        summary_parts.append(f"{most_stable['model']} shows the most consistent training trajectory.")

    return {
        "insights": insights,
        "insight_count": len(insights),
        "summary": " ".join(summary_parts) if summary_parts else "Insufficient data for comprehensive analysis.",
        "models_analyzed": [m["model_type"] for m in models],
    }


# ---------------------------------------------------------------------------
# Recommendation Engine
# ---------------------------------------------------------------------------

def generate_recommendations(
    snapshots: List[Dict],
    model_type: str = "GCN",
    config: Dict = None,
    graph_payload: Dict = None,
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

    sections = []

    # Summary section
    sections.append({
        "title": "Summary",
        "content": f"{model_type} trained for {len(snapshots)} epochs on {config.get('dataset', 'unknown')} dataset. "
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
        topo_desc = f"Dataset has {props.get('n_nodes', 0)} nodes, {props.get('n_edges', 0)} edges, {props.get('n_classes', 0)} classes. "
        topo_desc += f"Estimated homophily: {props.get('homophily_estimate', 0):.2f}. "
        topo_desc += f"Average degree: {props.get('avg_degree', 0):.1f}."
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
