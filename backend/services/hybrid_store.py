import gzip
import io
import json
import os
import re
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
    TrainingSession,
    User,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_MONGO_FALLBACK_DIR = os.path.join(BASE_DIR, "data", "mongo_fallback")
LOCAL_BLOB_DIR = os.path.join(BASE_DIR, "data", "blob_store")
os.makedirs(LOCAL_MONGO_FALLBACK_DIR, exist_ok=True)
os.makedirs(LOCAL_BLOB_DIR, exist_ok=True)
STRICT_RUNTIME_STACK = os.getenv("REQUIRE_RUNTIME_STACK", "0") == "1"


class PersistenceUnavailableError(RuntimeError):
    """Raised when a primary persistence backend is required but unavailable."""


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
        self.provider = os.getenv("BLOB_STORE_PROVIDER", "local").strip().lower()
        self.root_dir = os.getenv("LOCAL_BLOB_ROOT", LOCAL_BLOB_DIR)
        self.bucket = os.getenv("S3_BUCKET", "gnn-insight")
        self.endpoint = os.getenv("S3_ENDPOINT", "127.0.0.1:9000")
        self.secure = os.getenv("S3_SECURE", "0") == "1"
        self._client = None
        self._available = self.provider == "local"
        self._last_error: Optional[str] = None
        self._initialize_runtime()

    def _initialize_runtime(self) -> None:
        if self.provider == "local":
            self._available = True
            self._last_error = None
            os.makedirs(self.root_dir, exist_ok=True)
            return

        if self.provider != "minio":
            self._available = False
            self._last_error = f"Unsupported blob provider: {self.provider}"
            return

        if Minio is None:
            self._available = False
            self._last_error = "minio package is not installed"
            return

        try:
            self._client = Minio(
                self.endpoint,
                access_key=os.getenv("S3_ACCESS_KEY", "minioadmin"),
                secret_key=os.getenv("S3_SECRET_KEY", "minioadmin"),
                secure=self.secure,
            )
            self._ensure_bucket()
            self._available = True
            self._last_error = None
        except Exception as exc:
            self._client = None
            self._available = False
            self._last_error = str(exc)

    def _ensure_bucket(self) -> None:
        if not self._client:
            return
        found = self._client.bucket_exists(self.bucket)
        if not found:
            self._client.make_bucket(self.bucket)

    def get_runtime_status(self) -> Dict[str, Any]:
        if self.provider == "local":
            return {
                "provider": self.provider,
                "root_dir": self.root_dir,
                "bucket": None,
                "configured_endpoint": None,
                "available": True,
                "fallback_active": False,
                "strict_ready": False,
                "error": None,
            }

        return {
            "provider": self.provider,
            "root_dir": None,
            "bucket": self.bucket,
            "configured_endpoint": self.endpoint,
            "available": self._available,
            "fallback_active": False,
            "strict_ready": self.provider == "minio" and self._available,
            "error": self._last_error,
        }

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
        path = self._local_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, default=str)
        return key

    def put_bytes(self, key: str, payload: bytes) -> str:
        if self.provider == "minio" and self._client:
            return self._put_minio_bytes(key, payload, "application/octet-stream")
        path = self._local_path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(payload)
        return key

    def get_bytes(self, key: str) -> bytes:
        if self.provider == "minio" and self._client:
            response = self._client.get_object(self.bucket, key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        path = self._local_path(key)
        with open(path, "rb") as handle:
            return handle.read()

    def get_json(self, key: str) -> Any:
        raw = self.get_bytes(key)
        return json.loads(raw.decode("utf-8"))

    def _local_path(self, key: str) -> str:
        return os.path.join(self.root_dir, key.replace("/", os.sep))

    def exists(self, key: str) -> bool:
        if self.provider == "minio" and self._client:
            try:
                self._client.stat_object(self.bucket, key)
                return True
            except Exception:
                return False
        return os.path.exists(self._local_path(key))

    def delete(self, key: str) -> bool:
        if self.provider == "minio" and self._client:
            if not self.exists(key):
                return False
            self._client.remove_object(self.bucket, key)
            return True

        path = self._local_path(key)
        if not os.path.exists(path):
            return False
        os.remove(path)
        current_dir = os.path.dirname(path)
        root_dir = os.path.abspath(self.root_dir)
        while current_dir.startswith(root_dir) and current_dir != root_dir:
            if os.listdir(current_dir):
                break
            os.rmdir(current_dir)
            current_dir = os.path.dirname(current_dir)
        return True

    def list_keys(self, prefix: str = "") -> List[str]:
        normalized_prefix = prefix.strip("/")
        if self.provider == "minio" and self._client:
            objects = self._client.list_objects(self.bucket, prefix=normalized_prefix, recursive=True)
            return sorted(obj.object_name for obj in objects if not obj.is_dir)

        base_dir = self.root_dir
        if normalized_prefix:
            base_dir = self._local_path(normalized_prefix)
            if not os.path.exists(base_dir):
                return []
        if not os.path.exists(base_dir):
            return []
        keys = []
        for current_root, _, filenames in os.walk(base_dir):
            for filename in filenames:
                full_path = os.path.join(current_root, filename)
                relative_path = os.path.relpath(full_path, self.root_dir)
                keys.append(relative_path.replace(os.sep, "/"))
        return sorted(keys)


blob_store = BlobStore()


def get_blob_runtime_status() -> Dict[str, Any]:
    return blob_store.get_runtime_status()


def validate_blob_runtime_requirements(require_runtime_stack: bool | None = None) -> Dict[str, Any]:
    require_runtime_stack = STRICT_RUNTIME_STACK if require_runtime_stack is None else require_runtime_stack
    status = get_blob_runtime_status()
    if not require_runtime_stack:
        return status

    if status["provider"] == "local":
        raise RuntimeError(
            "Blob store is configured in local mode. Strict runtime mode requires MinIO or another S3-compatible provider."
        )
    if not status["available"]:
        raise RuntimeError(
            f"Blob store provider '{status['provider']}' is unavailable in strict mode."
        )
    return status


def collect_referenced_blob_keys(db: Session) -> set[str]:
    keys: set[str] = set()
    for raw_blob_key, processed_blob_key in db.query(
        DatasetVersion.raw_blob_key,
        DatasetVersion.processed_blob_key,
    ).all():
        if raw_blob_key:
            keys.add(raw_blob_key)
        if processed_blob_key:
            keys.add(processed_blob_key)
    for (config_json,) in db.query(TrainingSession.config_json).all():
        if not isinstance(config_json, dict):
            continue
        uploaded_file_path = config_json.get("uploaded_file_path")
        if isinstance(uploaded_file_path, str) and uploaded_file_path.strip():
            keys.add(uploaded_file_path.strip())
    return keys


def find_orphan_blob_keys(db: Session, *, prefix: str = "") -> List[str]:
    referenced_keys = collect_referenced_blob_keys(db)
    available_keys = blob_store.list_keys(prefix=prefix)
    return sorted(key for key in available_keys if key not in referenced_keys)


def cleanup_orphan_blob_keys(db: Session, *, dry_run: bool = True, prefix: str = "") -> Dict[str, Any]:
    orphan_keys = find_orphan_blob_keys(db, prefix=prefix)
    deleted_keys: List[str] = []
    if not dry_run:
        for key in orphan_keys:
            if blob_store.delete(key):
                deleted_keys.append(key)
    return {
        "provider": blob_store.provider,
        "dry_run": dry_run,
        "orphan_keys": orphan_keys,
        "deleted_keys": deleted_keys,
        "object_count": len(blob_store.list_keys(prefix=prefix)),
        "orphan_count": len(orphan_keys),
        "deleted_count": len(deleted_keys),
    }


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
    if uploaded_file_path:
        if os.path.exists(uploaded_file_path):
            with open(uploaded_file_path, "rb") as handle:
                processed_blob_key = blob_store.put_bytes(
                    f"datasets/raw/{slug}/processed.pt",
                    handle.read(),
                )
        elif blob_store.exists(uploaded_file_path):
            processed_blob_key = uploaded_file_path

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
    def is_strict_mode(self) -> bool:
        return STRICT_RUNTIME_STACK

    def is_document_store_available(self) -> bool:
        return mongo_available

    def _require_document_store(self, operation: str) -> None:
        if mongo_available:
            return
        raise PersistenceUnavailableError(
            f"MongoDB document store is unavailable for {operation}. "
            "Strict runtime mode does not allow local replay fallbacks in the main product flow."
        )

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
        if self.is_strict_mode():
            self._require_document_store("graph payload persistence")
        return self._write_fallback("graph_payloads", experiment.id, payload)

    def get_graph_payload(self, experiment: Experiment) -> Dict[str, Any]:
        if mongo_available:
            doc = mongo_graph_payloads.find_one({"experiment_id": experiment.id})
            if doc:
                doc.pop("_id", None)
                return doc
            if self.is_strict_mode():
                raise PersistenceUnavailableError(
                    f"Graph payload for experiment {experiment.id} is missing from MongoDB."
                )
        elif self.is_strict_mode():
            self._require_document_store("graph payload replay")
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
        if self.is_strict_mode():
            self._require_document_store("snapshot persistence")

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
            payloads = [row["payload"] for row in rows]
            if self.is_strict_mode() and not payloads:
                raise PersistenceUnavailableError(
                    f"Replay snapshots for experiment {experiment.id} are missing from MongoDB."
                )
            return payloads
        if self.is_strict_mode():
            self._require_document_store("snapshot replay")
        doc = self._read_fallback("snapshots", experiment.id) or {}
        return doc.get("snapshots", [])

    def get_snapshot(self, experiment: Experiment, epoch: int, run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        run_id = run_id or f"experiment:{experiment.id}"
        if mongo_available:
            row = mongo_experiment_snapshots.find_one(
                {"run_id": run_id, "epoch": epoch},
                {"payload": 1, "_id": 0},
            )
            if row:
                return row["payload"]
            if self.is_strict_mode():
                raise PersistenceUnavailableError(
                    f"Replay snapshot epoch {epoch} for experiment {experiment.id} is missing from MongoDB."
                )
            return None
        if self.is_strict_mode():
            self._require_document_store("snapshot replay")
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
        if self.is_strict_mode():
            self._require_document_store("session snapshot persistence")
        return None

    def get_session_snapshots(self, session_id: str, from_epoch: int = 0) -> List[Dict[str, Any]]:
        run_id = f"session:{session_id}"
        if mongo_available:
            rows = mongo_experiment_snapshots.find(
                {"run_id": run_id, "epoch": {"$gte": from_epoch}},
                {"payload": 1, "_id": 0},
            ).sort("epoch", 1)
            return [row["payload"] for row in rows]
        if self.is_strict_mode():
            self._require_document_store("session resume replay")
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
        if self.is_strict_mode():
            self._require_document_store("metrics persistence")
        return self._write_fallback("metrics", experiment.id, summary)

    def get_metrics(self, experiment: Experiment) -> Dict[str, Any]:
        if mongo_available:
            row = mongo_experiment_metrics.find_one({"experiment_id": experiment.id})
            if row:
                row.pop("_id", None)
                return row
            if self.is_strict_mode():
                raise PersistenceUnavailableError(
                    f"Metrics summary for experiment {experiment.id} is missing from MongoDB."
                )
        elif self.is_strict_mode():
            self._require_document_store("metrics query")
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
        if self.is_strict_mode():
            self._require_document_store("experiment delete")
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
        if self.is_strict_mode():
            self._require_document_store("retention compaction")

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
