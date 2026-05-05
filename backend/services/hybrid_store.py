import gzip
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

try:
    from pymongo import ReturnDocument
except ImportError:
    class ReturnDocument:
        AFTER = True

try:
    from minio import Minio
except ImportError:
    Minio = None
from sqlalchemy.orm import Session

from database import (
    mongo_available,
    mongo_experiment_metrics,
    mongo_experiment_snapshots,
    mongo_graph_payloads,
)
from models.sql_models import (
    AuditAction,
    AuditLog,
    Dataset,
    DatasetLifecycle,
    DatasetVersion,
    Experiment,
    Project,
    SessionStatus,
    User,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_MONGO_FALLBACK_DIR = os.path.join(BASE_DIR, "data", "mongo_fallback")
LOCAL_BLOB_DIR = os.path.join(BASE_DIR, "data", "blob_store")
os.makedirs(LOCAL_MONGO_FALLBACK_DIR, exist_ok=True)
os.makedirs(LOCAL_BLOB_DIR, exist_ok=True)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return cleaned or "untitled"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def safe_json_dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=True, default=str)


def _primary_score(snapshot: Dict[str, Any]) -> float:
    for key in ("val_acc", "auc", "validity_rate", "accuracy", "train_acc"):
        value = snapshot.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def _loss_value(snapshot: Dict[str, Any]) -> float:
    for key in ("train_loss", "val_loss", "loss", "recon_loss", "reconstruction_loss"):
        value = snapshot.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


class BlobStore:
    """Small abstraction layer so Phase 1 code does not hard-code local file paths."""

    def __init__(self):
        self.provider = os.getenv("BLOB_STORE_PROVIDER", "local")
        self.root_dir = os.getenv("LOCAL_BLOB_ROOT", LOCAL_BLOB_DIR)
        self.bucket = os.getenv("S3_BUCKET", "gnn-insight")
        self._client = None
        if self.provider == "minio" and Minio is not None:
            self._client = Minio(
                os.getenv("S3_ENDPOINT", "127.0.0.1:9000"),
                access_key=os.getenv("S3_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("S3_SECRET_KEY", "minioadmin"),
                secure=os.getenv("S3_SECURE", "0") == "1",
            )
            self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self._client:
            return
        found = self._client.bucket_exists(self.bucket)
        if not found:
            self._client.make_bucket(self.bucket)

    def _put_minio_bytes(self, key: str, payload: bytes, content_type: str) -> str:
        if not self._client:
            raise RuntimeError("MinIO client is not configured")
        from io import BytesIO

        data = BytesIO(payload)
        self._client.put_object(
            self.bucket,
            key,
            data=data,
            length=len(payload),
            content_type=content_type,
        )
        return key

    def put_json(self, key: str, payload: Any) -> str:
        if self.provider == "minio" and self._client:
            data = json.dumps(payload, ensure_ascii=True, default=str).encode("utf-8")
            return self._put_minio_bytes(key, data, "application/json")
        path = os.path.join(self.root_dir, key.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, default=str)
        return key

    def put_bytes(self, key: str, payload: bytes) -> str:
        if self.provider == "minio" and self._client:
            return self._put_minio_bytes(key, payload, "application/octet-stream")
        path = os.path.join(self.root_dir, key.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(payload)
        return key


blob_store = BlobStore()


def record_audit_log(
    db: Session,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    log = AuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details_json=details or {},
    )
    db.add(log)
    db.flush()
    return log


def ensure_default_project(db: Session, user: Optional[User], task_type: int, model_type: str) -> Project:
    owner_id = user.id if user else None
    project = (
        db.query(Project)
        .filter(Project.owner_id == owner_id, Project.title == "Default Library")
        .first()
    )
    if project:
        return project
    project = Project(
        title="Default Library",
        description="Auto-created compatibility project for legacy library saves.",
        task_type=task_type,
        model_type=model_type,
        owner_id=owner_id,
    )
    db.add(project)
    db.flush()
    return project


def ensure_default_dataset_version(
    db: Session,
    user: Optional[User],
    dataset_name: str,
    uploaded_file_path: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Tuple[Dataset, DatasetVersion]:
    owner_id = user.id if user else None
    slug = slugify(dataset_name)
    dataset = (
        db.query(Dataset)
        .filter(Dataset.slug == slug, Dataset.owner_id == owner_id)
        .first()
    )
    if not dataset:
        dataset = Dataset(
            name=dataset_name,
            slug=slug,
            description="Auto-created dataset entry for compatibility flow.",
            owner_id=owner_id,
            is_public=False,
        )
        db.add(dataset)
        db.flush()

    version = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.dataset_id == dataset.id)
        .order_by(DatasetVersion.version.desc())
        .first()
    )
    if version:
        return dataset, version

    processed_blob_key = None
    if uploaded_file_path and os.path.exists(uploaded_file_path):
        with open(uploaded_file_path, "rb") as handle:
            processed_blob_key = blob_store.put_bytes(
                f"datasets/raw/{slug}/processed.pt",
                handle.read(),
            )

    version = DatasetVersion(
        dataset_id=dataset.id,
        version=1,
        lifecycle=DatasetLifecycle.VALIDATED.value,
        summary_json=metadata or {},
        validation_json={"auto_created": True},
        processed_blob_key=processed_blob_key,
        created_by=owner_id,
    )
    db.add(version)
    db.flush()
    dataset.current_version_id = version.id
    return dataset, version


class MongoRunRepository:
    def _fallback_path(self, category: str, experiment_id: int) -> str:
        path = os.path.join(LOCAL_MONGO_FALLBACK_DIR, category)
        os.makedirs(path, exist_ok=True)
        return os.path.join(path, f"{experiment_id}.json.gz")

    def _write_fallback(self, category: str, experiment_id: int, payload: Any) -> str:
        path = self._fallback_path(category, experiment_id)
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, default=str)
        return path

    def _read_fallback(self, category: str, experiment_id: int) -> Any:
        path = self._fallback_path(category, experiment_id)
        if not os.path.exists(path):
            return None
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    def save_graph_payload(
        self,
        experiment: Experiment,
        config_json: Any,
        graph_data_json: Any,
        ground_truth_json: Any,
        task_data_json: Any,
    ) -> str:
        payload = {
            "experiment_id": experiment.id,
            "project_id": experiment.project_id,
            "graph_data_json": graph_data_json,
            "ground_truth_json": ground_truth_json,
            "task_data_json": task_data_json,
            "config_json": config_json,
            "created_at": utcnow(),
        }
        if mongo_available:
            result = mongo_graph_payloads.find_one_and_update(
                {"experiment_id": experiment.id},
                {"$set": payload},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            if result and result.get("_id"):
                return str(result["_id"])
            created = mongo_graph_payloads.find_one({"experiment_id": experiment.id}, {"_id": 1})
            return str(created["_id"])
        return self._write_fallback("graph_payloads", experiment.id, payload)

    def get_graph_payload(self, experiment: Experiment) -> Dict[str, Any]:
        if mongo_available:
            doc = mongo_graph_payloads.find_one({"experiment_id": experiment.id})
            if doc:
                doc.pop("_id", None)
                return doc
        return self._read_fallback("graph_payloads", experiment.id) or {}

    def save_snapshots(self, experiment: Experiment, snapshots: List[Dict[str, Any]], run_id: Optional[str] = None) -> List[str]:
        run_id = run_id or f"experiment:{experiment.id}"
        if mongo_available:
            ids = []
            for snapshot in snapshots:
                epoch = int(snapshot.get("epoch", 0))
                payload = {
                    "run_id": run_id,
                    "experiment_id": experiment.id,
                    "project_id": experiment.project_id,
                    "task_type": experiment.task_type,
                    "model_type": experiment.model_type,
                    "epoch": epoch,
                    "payload": snapshot,
                    "created_at": utcnow(),
                    "retained": True,
                }
                mongo_experiment_snapshots.update_one(
                    {"experiment_id": experiment.id, "epoch": epoch},
                    {"$set": payload},
                    upsert=True,
                )
                ids.append(f"{experiment.id}:{epoch}")
            return ids

        fallback_payload = {
            "experiment_id": experiment.id,
            "run_id": run_id,
            "snapshots": snapshots,
        }
        self._write_fallback("snapshots", experiment.id, fallback_payload)
        return [f"{experiment.id}:{int(s.get('epoch', 0))}" for s in snapshots]

    def list_snapshots(self, experiment: Experiment, run_id: Optional[str] = None) -> List[Dict[str, Any]]:
        run_id = run_id or f"experiment:{experiment.id}"
        if mongo_available:
            rows = mongo_experiment_snapshots.find(
                {"run_id": run_id},
                {"payload": 1, "_id": 0},
            ).sort("epoch", 1)
            return [row["payload"] for row in rows]
        doc = self._read_fallback("snapshots", experiment.id) or {}
        return doc.get("snapshots", [])

    def get_snapshot(self, experiment: Experiment, epoch: int, run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        run_id = run_id or f"experiment:{experiment.id}"
        if mongo_available:
            row = mongo_experiment_snapshots.find_one(
                {"run_id": run_id, "epoch": epoch},
                {"payload": 1, "_id": 0},
            )
            return row["payload"] if row else None
        for snapshot in self.list_snapshots(experiment):
            if int(snapshot.get("epoch", -1)) == epoch:
                return snapshot
        return None

    def save_session_snapshot(
        self,
        session_id: str,
        experiment_id: Optional[int],
        project_id: Optional[int],
        task_type: int,
        model_type: str,
        epoch: int,
        snapshot: Dict[str, Any],
    ) -> Optional[str]:
        run_id = f"session:{session_id}"
        payload = {
            "run_id": run_id,
            "session_id": session_id,
            "experiment_id": experiment_id,
            "project_id": project_id,
            "task_type": task_type,
            "model_type": model_type,
            "epoch": epoch,
            "payload": snapshot,
            "created_at": utcnow(),
            "retained": True,
        }
        if mongo_available:
            mongo_experiment_snapshots.update_one(
                {"run_id": run_id, "epoch": epoch},
                {"$set": payload},
                upsert=True,
            )
            return f"{run_id}:{epoch}"
        return None

    def get_session_snapshots(self, session_id: str, from_epoch: int = 0) -> List[Dict[str, Any]]:
        run_id = f"session:{session_id}"
        if mongo_available:
            rows = mongo_experiment_snapshots.find(
                {"run_id": run_id, "epoch": {"$gte": from_epoch}},
                {"payload": 1, "_id": 0},
            ).sort("epoch", 1)
            return [row["payload"] for row in rows]
        return []

    def save_metrics(
        self,
        experiment: Experiment,
        snapshots: List[Dict[str, Any]],
        config_json: Any,
    ) -> str:
        best_epoch = 0
        best_score = float("-inf")
        history = {"epoch": [], "train_loss": [], "val_loss": [], "primary_score": []}
        for snapshot in snapshots:
            epoch = int(snapshot.get("epoch", 0))
            score = _primary_score(snapshot)
            loss = _loss_value(snapshot)
            history["epoch"].append(epoch)
            history["train_loss"].append(snapshot.get("train_loss"))
            history["val_loss"].append(snapshot.get("val_loss"))
            history["primary_score"].append(score)
            if score >= best_score:
                best_score = score
                best_epoch = epoch

        summary = {
            "experiment_id": experiment.id,
            "project_id": experiment.project_id,
            "task_type": experiment.task_type,
            "model_type": experiment.model_type,
            "dataset_version_id": experiment.dataset_version_id,
            "dataset_name": experiment.dataset_name,
            "best_epoch": best_epoch,
            "best_score": best_score if best_score != float("-inf") else 0.0,
            "history": history,
            "config_json": config_json,
            "created_at": utcnow(),
        }

        if mongo_available:
            mongo_experiment_metrics.update_one(
                {"experiment_id": experiment.id},
                {"$set": summary},
                upsert=True,
            )
            row = mongo_experiment_metrics.find_one({"experiment_id": experiment.id}, {"_id": 1})
            return str(row["_id"])
        return self._write_fallback("metrics", experiment.id, summary)

    def get_metrics(self, experiment: Experiment) -> Dict[str, Any]:
        if mongo_available:
            row = mongo_experiment_metrics.find_one({"experiment_id": experiment.id})
            if row:
                row.pop("_id", None)
                return row
        return self._read_fallback("metrics", experiment.id) or {}

    def delete_experiment(self, experiment: Experiment) -> None:
        if mongo_available:
            mongo_experiment_snapshots.delete_many(
                {
                    "$or": [
                        {"experiment_id": experiment.id},
                        {"run_id": f"experiment:{experiment.id}"},
                    ]
                }
            )
            mongo_experiment_metrics.delete_many({"experiment_id": experiment.id})
            mongo_graph_payloads.delete_many({"experiment_id": experiment.id})
            return
        for category in ("snapshots", "metrics", "graph_payloads"):
            path = self._fallback_path(category, experiment.id)
            if os.path.exists(path):
                os.remove(path)

    def compact_experiment(self, experiment: Experiment, keep_epochs: List[int], dry_run: bool = True) -> Dict[str, Any]:
        keep_epochs = sorted(set(int(epoch) for epoch in keep_epochs))
        if mongo_available:
            all_epochs = [
                row["epoch"]
                for row in mongo_experiment_snapshots.find(
                    {"run_id": f"experiment:{experiment.id}"},
                    {"epoch": 1, "_id": 0},
                )
            ]
            delete_epochs = [epoch for epoch in all_epochs if epoch not in keep_epochs]
            if not dry_run and delete_epochs:
                mongo_experiment_snapshots.delete_many(
                    {"run_id": f"experiment:{experiment.id}", "epoch": {"$in": delete_epochs}}
                )
            return {"kept_epochs": keep_epochs, "deleted_epochs": delete_epochs, "mode": "mongo"}

        snapshots = self.list_snapshots(experiment)
        kept = [snapshot for snapshot in snapshots if int(snapshot.get("epoch", -1)) in keep_epochs]
        deleted_epochs = [
            int(snapshot.get("epoch", -1))
            for snapshot in snapshots
            if int(snapshot.get("epoch", -1)) not in keep_epochs
        ]
        if not dry_run:
            self._write_fallback("snapshots", experiment.id, {"experiment_id": experiment.id, "snapshots": kept})
        return {"kept_epochs": keep_epochs, "deleted_epochs": deleted_epochs, "mode": "fallback"}


mongo_runs = MongoRunRepository()


@dataclass
class RetentionDecision:
    experiment_id: int
    keep_full: bool
    keep_epochs: List[int]
    reason: List[str]


class RetentionService:
    def build_plan(self, db: Session) -> List[RetentionDecision]:
        now = utcnow()
        decisions: List[RetentionDecision] = []
        project_latest_cache: Dict[Optional[int], List[int]] = {}

        all_experiments = db.query(Experiment).order_by(Experiment.created_at.desc()).all()
        for experiment in all_experiments:
            if experiment.project_id not in project_latest_cache:
                latest_ids = [
                    row.id
                    for row in db.query(Experiment)
                    .filter(Experiment.project_id == experiment.project_id)
                    .order_by(Experiment.created_at.desc())
                    .limit(10)
                    .all()
                ]
                project_latest_cache[experiment.project_id] = latest_ids

            reasons: List[str] = []
            if experiment.is_best:
                reasons.append("best_run")
            if experiment.id in project_latest_cache[experiment.project_id]:
                reasons.append("latest_10_in_project")
            created_at = experiment.created_at
            if created_at and created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            if created_at and created_at >= now - timedelta(days=14):
                reasons.append("recent_14_days")

            snapshots = mongo_runs.list_snapshots(experiment)
            epochs = sorted(int(snapshot.get("epoch", 0)) for snapshot in snapshots)
            if not epochs:
                keep_epochs = []
            elif reasons:
                keep_epochs = epochs
            else:
                best_epoch = experiment.best_epoch or (epochs[-1] if epochs else 0)
                keep_epochs = [0, best_epoch, epochs[-1]]
                keep_epochs.extend(epoch for epoch in epochs if epoch % 10 == 0)
                keep_epochs = sorted(set(epoch for epoch in keep_epochs if epoch in epochs))

            decisions.append(
                RetentionDecision(
                    experiment_id=experiment.id,
                    keep_full=bool(reasons),
                    keep_epochs=keep_epochs,
                    reason=reasons or ["compacted"],
                )
            )
        return decisions

    def run(self, db: Session, dry_run: bool = True) -> List[Dict[str, Any]]:
        results = []
        for decision in self.build_plan(db):
            experiment = db.query(Experiment).filter(Experiment.id == decision.experiment_id).first()
            if not experiment:
                continue
            result = mongo_runs.compact_experiment(experiment, decision.keep_epochs, dry_run=dry_run)
            if not dry_run:
                experiment.retention_state = "full" if decision.keep_full else "compacted"
                record_audit_log(
                    db,
                    AuditAction.RETENTION_COMPACTED.value,
                    "experiment",
                    str(experiment.id),
                    details={
                        "reason": decision.reason,
                        "kept_epochs": decision.keep_epochs,
                        "deleted_epochs": result["deleted_epochs"],
                        "dry_run": False,
                    },
                )
            results.append(
                {
                    "experiment_id": experiment.id,
                    "keep_full": decision.keep_full,
                    "reason": decision.reason,
                    **result,
                }
            )
        if not dry_run:
            db.commit()
        return results


retention_service = RetentionService()
