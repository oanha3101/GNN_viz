import os
import sys

os.environ["DISABLE_AUTH"] = "0"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models.sql_models import Dataset, DatasetLifecycle, DatasetVersion, SessionStatus, TrainingSession
from services.hybrid_store import (
    blob_store,
    cleanup_orphan_blob_keys,
    collect_referenced_blob_keys,
    find_orphan_blob_keys,
)


def test_collect_referenced_blob_keys_and_orphan_detection():
    db = SessionLocal()
    try:
        dataset = Dataset(name="Blob Dataset", slug="blob-dataset", description="blob lifecycle test")
        db.add(dataset)
        db.flush()

        version = DatasetVersion(
            dataset_id=dataset.id,
            version=1,
            lifecycle=DatasetLifecycle.VALIDATED.value,
            raw_blob_key="datasets/raw/blob-dataset/source.zip",
            processed_blob_key="datasets/processed/blob-dataset/graph.pt",
        )
        db.add(version)
        db.commit()

        blob_store.put_bytes("datasets/raw/blob-dataset/source.zip", b"raw")
        blob_store.put_bytes("datasets/processed/blob-dataset/graph.pt", b"processed")
        blob_store.put_bytes("datasets/raw/blob-dataset/orphan.bin", b"orphan")

        referenced = collect_referenced_blob_keys(db)
        assert "datasets/raw/blob-dataset/source.zip" in referenced
        assert "datasets/processed/blob-dataset/graph.pt" in referenced

        orphan_keys = find_orphan_blob_keys(db)
        assert "datasets/raw/blob-dataset/orphan.bin" in orphan_keys
        assert "datasets/raw/blob-dataset/source.zip" not in orphan_keys
        assert "datasets/processed/blob-dataset/graph.pt" not in orphan_keys
    finally:
        db.close()


def test_cleanup_orphan_blob_keys_preserves_referenced_objects():
    db = SessionLocal()
    try:
        dataset = Dataset(name="Blob Cleanup", slug="blob-cleanup", description="blob cleanup test")
        db.add(dataset)
        db.flush()

        version = DatasetVersion(
            dataset_id=dataset.id,
            version=1,
            lifecycle=DatasetLifecycle.PUBLISHED.value,
            raw_blob_key="datasets/raw/blob-cleanup/keep.zip",
        )
        db.add(version)
        db.commit()

        blob_store.put_bytes("datasets/raw/blob-cleanup/keep.zip", b"keep")
        blob_store.put_bytes("datasets/raw/blob-cleanup/delete.bin", b"delete")

        dry_run_result = cleanup_orphan_blob_keys(db, dry_run=True)
        assert "datasets/raw/blob-cleanup/delete.bin" in dry_run_result["orphan_keys"]
        assert blob_store.exists("datasets/raw/blob-cleanup/keep.zip") is True
        assert blob_store.exists("datasets/raw/blob-cleanup/delete.bin") is True

        result = cleanup_orphan_blob_keys(db, dry_run=False)
        assert "datasets/raw/blob-cleanup/delete.bin" in result["deleted_keys"]
        assert blob_store.exists("datasets/raw/blob-cleanup/keep.zip") is True
        assert blob_store.exists("datasets/raw/blob-cleanup/delete.bin") is False
    finally:
        db.close()


def test_collect_referenced_blob_keys_includes_active_training_session_artifacts():
    db = SessionLocal()
    try:
        runtime_key = "datasets/runtime/session-artifacts/runtime-graph.pt"
        blob_store.put_bytes(runtime_key, b"runtime-graph")

        session = TrainingSession(
            id="session-artifact-1",
            task_type=1,
            model_type="GCN",
            dataset_name="runtime-session",
            status=SessionStatus.RUNNING.value,
            config_json={"uploaded_file_path": runtime_key},
        )
        db.add(session)
        db.commit()

        referenced = collect_referenced_blob_keys(db)
        assert runtime_key in referenced

        orphan_keys = find_orphan_blob_keys(db)
        assert runtime_key not in orphan_keys
    finally:
        db.close()
