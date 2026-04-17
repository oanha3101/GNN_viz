from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder
import networkx as nx
import torch
from torch_geometric.data import Data
import tempfile
import os
import json
import io

from api.task_adapters import get_adapter, TASK_ADAPTERS

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic Models
# ══════════════════════════════════════════════════════════════════════════════

class MappingConfig(BaseModel):
    task: int
    # ── Node fields ──
    node_id: str
    node_label: Optional[str] = None
    node_features: List[str] = []
    # ── Edge fields ──
    edge_source: str
    edge_target: str
    edge_weight: Optional[str] = None
    edge_label: Optional[str] = None
    edge_features: List[str] = []
    # ── Graph-level fields ──
    graph_id: Optional[str] = None
    graph_label: Optional[str] = None
    graph_features: List[str] = []
    # ── Task-specific fields ──
    community_label: Optional[str] = None
    is_directed: bool = False
    num_communities: Optional[int] = None
    edge_split_ratio: float = 0.15


class ConfigurePayload(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    graphs: Optional[List[Dict[str, Any]]] = None
    mapping: MappingConfig


# ══════════════════════════════════════════════════════════════════════════════
# Common node/edge parsing logic (shared by JSON payload and file upload)
# ══════════════════════════════════════════════════════════════════════════════

def _parse_and_align(df_nodes: pd.DataFrame, df_edges: pd.DataFrame,
                     df_graphs: Optional[pd.DataFrame], m: MappingConfig):
    """Map node IDs to 0-based indices, align DataFrames.

    Returns: (df_nodes_aligned, df_edges_aligned, node_mapper, num_nodes, num_edges)
    """
    # 1. Map Node IDs to 0-based indices
    all_node_ids = pd.concat([
        df_nodes[m.node_id],
        df_edges[m.edge_source],
        df_edges[m.edge_target]
    ]).dropna().unique()
    node_mapper = {orig_id: i for i, orig_id in enumerate(all_node_ids)}
    num_nodes = len(node_mapper)

    # Build aligned dataframe so row index i corresponds to _internal_id = i
    aligned_df = pd.DataFrame({m.node_id: list(all_node_ids)})
    aligned_df['_internal_id'] = range(num_nodes)

    # Merge user features/labels into aligned_df
    df_nodes_unique = df_nodes.drop_duplicates(subset=[m.node_id])
    df_nodes = pd.merge(aligned_df, df_nodes_unique, on=m.node_id, how='left')

    df_edges['_internal_source'] = df_edges[m.edge_source].map(node_mapper)
    df_edges['_internal_target'] = df_edges[m.edge_target].map(node_mapper)

    # Drop edges that reference non-existent nodes
    df_edges.dropna(subset=['_internal_source', '_internal_target'], inplace=True)
    df_edges['_internal_source'] = df_edges['_internal_source'].astype(int)
    df_edges['_internal_target'] = df_edges['_internal_target'].astype(int)

    num_edges = len(df_edges)

    return df_nodes, df_edges, node_mapper, num_nodes, num_edges


def _save_pyg_data(result: dict) -> str:
    """Save PyG Data (single or list) to temp file. Returns file path."""
    datasets_dir = os.path.join(os.path.dirname(__file__), '..', 'datasets')
    os.makedirs(datasets_dir, exist_ok=True)

    f = tempfile.NamedTemporaryFile(
        delete=False, suffix=".pt", dir=datasets_dir
    )
    tmp_path = f.name
    f.close()

    if 'pyg_data_list' in result:
        torch.save(result['pyg_data_list'], tmp_path)
    else:
        torch.save(result['pyg_data'], tmp_path)

    return tmp_path


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/configure — JSON payload (original flow, backward-compatible)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/configure")
async def configure_dataset(payload: ConfigurePayload):
    try:
        df_nodes = pd.DataFrame(payload.nodes)
        df_edges = pd.DataFrame(payload.edges)
        df_graphs = pd.DataFrame(payload.graphs) if payload.graphs else None
        m = payload.mapping

        # Validate using task adapter
        adapter = get_adapter(m.task)
        node_cols = list(df_nodes.columns)
        edge_cols = list(df_edges.columns)
        graph_cols = list(df_graphs.columns) if df_graphs is not None else []

        errors, warnings = adapter.validate(m, node_cols, edge_cols, graph_cols)
        if errors:
            raise HTTPException(status_code=400, detail={
                "message": "Validation failed",
                "errors": errors,
                "warnings": warnings,
            })

        # Parse and align
        df_nodes, df_edges, node_mapper, num_nodes, num_edges = _parse_and_align(
            df_nodes, df_edges, df_graphs, m
        )

        # Process using task adapter
        result = adapter.process(df_nodes, df_edges, df_graphs, m, node_mapper, num_nodes)

        # Save PyG data
        tmp_path = _save_pyg_data(result)

        return {
            "status": "success",
            "metadata": {
                "task": m.task,
                "num_nodes": num_nodes,
                "num_edges": num_edges,
                "num_features": result.get('num_features', 1),
                "num_classes": result.get('num_classes', 1),
                "is_directed": m.is_directed,
                "has_edge_weights": result.get('has_edge_weights', False),
                "num_graphs": result.get('num_graphs', 1),
                "num_communities": result.get('num_communities', None),
                "has_community_gt": result.get('has_community_gt', False),
                "schema_version": "2.0",
            },
            "graph_json": result['graph_json'],
            "uploaded_file_path": tmp_path,
            "dataset_name": "custom",
            "validation_warnings": warnings,
            # Task-specific config to pass to training
            "task_config": {
                "edge_split_ratio": result.get('edge_split_ratio', 0.15),
                "num_communities": result.get('num_communities', 4),
                "has_community_gt": result.get('has_community_gt', False),
                "reference_density": result.get('reference_density', None),
                "reference_avg_degree": result.get('reference_avg_degree', None),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/validate-mapping — validate without processing
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/validate-mapping")
async def validate_mapping(payload: ConfigurePayload):
    """Validate mapping configuration and return preview data without full processing."""
    try:
        df_nodes = pd.DataFrame(payload.nodes[:5])  # Only first 5 rows for preview
        df_edges = pd.DataFrame(payload.edges[:5])
        df_graphs = pd.DataFrame(payload.graphs[:5]) if payload.graphs else None
        m = payload.mapping

        adapter = get_adapter(m.task)
        node_cols = list(pd.DataFrame(payload.nodes[:1]).columns) if payload.nodes else []
        edge_cols = list(pd.DataFrame(payload.edges[:1]).columns) if payload.edges else []
        graph_cols = list(pd.DataFrame(payload.graphs[:1]).columns) if payload.graphs else []

        errors, warnings = adapter.validate(m, node_cols, edge_cols, graph_cols)

        # Required fields info
        required_fields = adapter.required_fields()

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "required_fields": required_fields,
            "preview": {
                "num_nodes": len(payload.nodes),
                "num_edges": len(payload.edges),
                "num_graphs": len(payload.graphs) if payload.graphs else 0,
                "node_columns": node_cols,
                "edge_columns": edge_cols,
                "graph_columns": graph_cols,
                "sample_nodes": payload.nodes[:3],
                "sample_edges": payload.edges[:3],
            }
        }
    except Exception as e:
        return {"valid": False, "errors": [str(e)], "warnings": [], "preview": {}}


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/upload-files — Direct file upload to backend (for large datasets)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/upload-files")
async def upload_files(
    nodes_file: UploadFile = File(...),
    edges_file: UploadFile = File(...),
    graphs_file: Optional[UploadFile] = File(None),
    mapping_json: str = Form(...),
):
    """Upload Excel/CSV/JSON files directly to backend for server-side parsing.
    
    This is the fast path for large datasets — files are parsed on the server
    instead of being serialized as JSON in the browser.
    """
    try:
        m = MappingConfig(**json.loads(mapping_json))

        # Parse files server-side
        df_nodes = _parse_upload_file(nodes_file, await nodes_file.read(), nodes_file.filename)
        df_edges = _parse_upload_file(edges_file, await edges_file.read(), edges_file.filename)
        df_graphs = None
        if graphs_file:
            df_graphs = _parse_upload_file(graphs_file, await graphs_file.read(), graphs_file.filename)

        # Validate
        adapter = get_adapter(m.task)
        node_cols = list(df_nodes.columns)
        edge_cols = list(df_edges.columns)
        graph_cols = list(df_graphs.columns) if df_graphs is not None else []

        errors, warnings = adapter.validate(m, node_cols, edge_cols, graph_cols)
        if errors:
            raise HTTPException(status_code=400, detail={
                "message": "Validation failed",
                "errors": errors,
                "warnings": warnings,
            })

        # Parse and align
        df_nodes, df_edges, node_mapper, num_nodes, num_edges = _parse_and_align(
            df_nodes, df_edges, df_graphs, m
        )

        # Process using task adapter
        result = adapter.process(df_nodes, df_edges, df_graphs, m, node_mapper, num_nodes)

        # Save PyG data
        tmp_path = _save_pyg_data(result)

        return {
            "status": "success",
            "metadata": {
                "task": m.task,
                "num_nodes": num_nodes,
                "num_edges": num_edges,
                "num_features": result.get('num_features', 1),
                "num_classes": result.get('num_classes', 1),
                "is_directed": m.is_directed,
                "has_edge_weights": result.get('has_edge_weights', False),
                "num_graphs": result.get('num_graphs', 1),
                "num_communities": result.get('num_communities', None),
                "has_community_gt": result.get('has_community_gt', False),
                "schema_version": "2.0",
            },
            "graph_json": result['graph_json'],
            "uploaded_file_path": tmp_path,
            "dataset_name": "custom",
            "validation_warnings": warnings,
            "task_config": {
                "edge_split_ratio": result.get('edge_split_ratio', 0.15),
                "num_communities": result.get('num_communities', 4),
                "has_community_gt": result.get('has_community_gt', False),
                "reference_density": result.get('reference_density', None),
                "reference_avg_degree": result.get('reference_avg_degree', None),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


def _parse_upload_file(file_obj, content: bytes, filename: str) -> pd.DataFrame:
    """Parse uploaded file (Excel, CSV, or JSON) into DataFrame."""
    ext = os.path.splitext(filename)[1].lower()

    if ext == '.json':
        data = json.loads(content.decode('utf-8'))
        if isinstance(data, list):
            return pd.DataFrame(data)
        elif isinstance(data, dict):
            # Try to find the first list value
            for v in data.values():
                if isinstance(v, list):
                    return pd.DataFrame(v)
            return pd.DataFrame([data])
        raise ValueError(f"Cannot parse JSON file '{filename}' into a table")

    elif ext == '.csv':
        return pd.read_csv(io.BytesIO(content))

    elif ext in ('.xlsx', '.xls'):
        import openpyxl
        return pd.read_excel(io.BytesIO(content))

    else:
        # Try CSV as fallback
        try:
            return pd.read_csv(io.BytesIO(content))
        except Exception:
            raise ValueError(f"Unsupported file format: {ext}. Use .csv, .xlsx, or .json")


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/task-requirements/{task_id} — return required fields for a task
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/task-requirements/{task_id}")
async def get_task_requirements(task_id: int):
    """Return the data requirements for a given task."""
    try:
        adapter = get_adapter(task_id)
        return {
            "task_id": task_id,
            "task_name": adapter.task_name,
            "required_fields": adapter.required_fields(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/sample-template/{task_id} — download sample Excel template
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sample-template/{task_id}")
async def get_sample_template(task_id: int):
    """Generate and return a sample Excel template for the specified task."""
    try:
        import openpyxl
        from io import BytesIO

        output = BytesIO()

        if task_id == 1:
            # Node Classification: nodes + edges
            nodes_df = pd.DataFrame({
                'node_id': range(1, 21),
                'feature_1': np.random.randn(20).round(3),
                'feature_2': np.random.randn(20).round(3),
                'feature_3': np.random.randn(20).round(3),
                'label': np.random.choice(['ClassA', 'ClassB', 'ClassC'], 20),
            })
            edges_df = pd.DataFrame({
                'source': np.random.choice(range(1, 21), 40),
                'target': np.random.choice(range(1, 21), 40),
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                nodes_df.to_excel(writer, sheet_name='nodes', index=False)
                edges_df.to_excel(writer, sheet_name='edges', index=False)

        elif task_id == 2:
            # Graph Classification: nodes (with graph_id) + edges + graphs
            nodes_data = []
            edges_data = []
            for g in range(5):
                n = np.random.randint(6, 12)
                for i in range(n):
                    nodes_data.append({
                        'node_id': g * 100 + i,
                        'graph_id': g,
                        'feature_1': round(np.random.randn(), 3),
                    })
                for _ in range(n * 2):
                    s, t = np.random.choice(range(g*100, g*100+n), 2, replace=False)
                    edges_data.append({'source': int(s), 'target': int(t)})

            graphs_df = pd.DataFrame({
                'graph_id': range(5),
                'label': np.random.choice(['TypeA', 'TypeB'], 5)
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                pd.DataFrame(nodes_data).to_excel(writer, sheet_name='nodes', index=False)
                pd.DataFrame(edges_data).to_excel(writer, sheet_name='edges', index=False)
                graphs_df.to_excel(writer, sheet_name='graphs', index=False)

        elif task_id == 3:
            # Link Prediction: nodes + edges with weight
            nodes_df = pd.DataFrame({
                'node_id': range(1, 31),
                'feature_1': np.random.randn(30).round(3),
            })
            edges_df = pd.DataFrame({
                'source': np.random.choice(range(1, 31), 60),
                'target': np.random.choice(range(1, 31), 60),
                'weight': np.random.rand(60).round(3),
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                nodes_df.to_excel(writer, sheet_name='nodes', index=False)
                edges_df.to_excel(writer, sheet_name='edges', index=False)

        elif task_id == 4:
            # Community Detection: nodes (with community) + edges
            nodes_df = pd.DataFrame({
                'node_id': range(1, 41),
                'feature_1': np.random.randn(40).round(3),
                'community': np.random.choice(['GroupA', 'GroupB', 'GroupC', 'GroupD'], 40),
            })
            edges_df = pd.DataFrame({
                'source': np.random.choice(range(1, 41), 80),
                'target': np.random.choice(range(1, 41), 80),
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                nodes_df.to_excel(writer, sheet_name='nodes', index=False)
                edges_df.to_excel(writer, sheet_name='edges', index=False)

        elif task_id == 5:
            # Graph Embedding: nodes + edges (minimal)
            nodes_df = pd.DataFrame({
                'node_id': range(1, 31),
            })
            edges_df = pd.DataFrame({
                'source': np.random.choice(range(1, 31), 50),
                'target': np.random.choice(range(1, 31), 50),
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                nodes_df.to_excel(writer, sheet_name='nodes', index=False)
                edges_df.to_excel(writer, sheet_name='edges', index=False)

        elif task_id == 6:
            # Graph Generation: nodes + edges (reference graph)
            nodes_df = pd.DataFrame({
                'node_id': range(1, 21),
            })
            edges_df = pd.DataFrame({
                'source': np.random.choice(range(1, 21), 35),
                'target': np.random.choice(range(1, 21), 35),
            })
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                nodes_df.to_excel(writer, sheet_name='nodes', index=False)
                edges_df.to_excel(writer, sheet_name='edges', index=False)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown task ID: {task_id}")

        output.seek(0)

        # Save to temp file for FileResponse
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        tmp.write(output.read())
        tmp.close()

        return FileResponse(
            tmp.name,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename=f'task{task_id}_sample_template.xlsx',
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
