from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


class SessionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    RESEARCHER = "researcher"
    VIEWER = "viewer"


class DatasetLifecycle(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class AuditAction(str, enum.Enum):
    LOGIN = "login"
    ROLE_CHANGED = "role_changed"
    DATASET_UPLOADED = "dataset_uploaded"
    DATASET_PUBLISHED = "dataset_published"
    DATASET_DEPRECATED = "dataset_deprecated"
    EXPERIMENT_UPDATED = "experiment_updated"
    EXPERIMENT_DELETED = "experiment_deleted"
    REPORT_GENERATED = "report_generated"
    RETENTION_COMPACTED = "retention_compacted"
    RETENTION_PURGED = "retention_purged"
    SESSION_STOPPED = "session_stopped"
    SESSION_RETRIED = "session_retried"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    role = Column(String(20), default=UserRole.RESEARCHER.value, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    profile_image = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    datasets = relationship("Dataset", back_populates="owner")
    dataset_versions = relationship(
        "DatasetVersion",
        back_populates="creator",
        foreign_keys="DatasetVersion.created_by",
    )
    published_dataset_versions = relationship(
        "DatasetVersion",
        foreign_keys="DatasetVersion.published_by",
    )
    experiments = relationship("Experiment", back_populates="owner")
    training_sessions = relationship("TrainingSession", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="actor")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    task_type = Column(Integer)
    model_type = Column(String(20))
    is_public = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="projects")
    experiments = relationship("Experiment", back_populates="project", cascade="all, delete-orphan")
    training_sessions = relationship("TrainingSession", back_populates="project", cascade="all, delete-orphan")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False, index=True)
    slug = Column(String(180), nullable=False, unique=True, index=True)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    is_public = Column(Boolean, default=False)
    current_version_id = Column(Integer, ForeignKey("dataset_versions.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="datasets")
    current_version = relationship("DatasetVersion", foreign_keys=[current_version_id], post_update=True)
    versions = relationship(
        "DatasetVersion",
        back_populates="dataset",
        foreign_keys="DatasetVersion.dataset_id",
        cascade="all, delete-orphan",
    )
    experiments = relationship("Experiment", back_populates="dataset")


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(Integer, primary_key=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    lifecycle = Column(String(20), default=DatasetLifecycle.DRAFT.value, nullable=False, index=True)
    schema_version = Column(String(20), default="2.0")
    summary_json = Column(JSON)
    validation_json = Column(JSON)
    source_files_json = Column(JSON)
    raw_blob_key = Column(String(500))
    processed_blob_key = Column(String(500))
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    published_at = Column(DateTime, nullable=True)

    dataset = relationship("Dataset", back_populates="versions", foreign_keys=[dataset_id])
    creator = relationship("User", back_populates="dataset_versions", foreign_keys=[created_by])
    experiments = relationship("Experiment", back_populates="dataset_version")

    __table_args__ = (
        UniqueConstraint("dataset_id", "version", name="uq_dataset_version"),
    )


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False, default="Untitled Run")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=True, index=True)
    dataset_version_id = Column(Integer, ForeignKey("dataset_versions.id"), nullable=True, index=True)
    task_type = Column(Integer, default=1, index=True)
    model_type = Column(String(20), default="GCN", index=True)
    dataset_name = Column(String(100), default="cora")
    epoch_count = Column(Integer, default=0)
    learning_rate = Column(Float)
    hidden_dim = Column(Integer)
    dropout = Column(Float)
    accuracy = Column(Float)
    loss = Column(Float)
    best_epoch = Column(Integer, default=0)
    status = Column(String(20), default=SessionStatus.PENDING.value, index=True)
    mongo_run_id = Column(String(100), index=True)
    mongo_graph_payload_id = Column(String(100), index=True)
    mongo_metrics_id = Column(String(100), index=True)
    config_json = Column(JSON)
    retention_state = Column(String(20), default="full")
    notes = Column(Text)
    is_best = Column(Boolean, default=False)
    is_mock = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    project = relationship("Project", back_populates="experiments")
    owner = relationship("User", back_populates="experiments")
    dataset = relationship("Dataset", back_populates="experiments")
    dataset_version = relationship("DatasetVersion", back_populates="experiments")
    training_sessions = relationship("TrainingSession", back_populates="experiment")


class TrainingSession(Base):
    __tablename__ = "training_sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=True, index=True)
    dataset_version_id = Column(Integer, ForeignKey("dataset_versions.id"), nullable=True, index=True)
    task_type = Column(Integer, nullable=False)
    model_type = Column(String(20), default="GCN")
    dataset_name = Column(String(100), default="cora")
    config_json = Column(JSON)
    status = Column(String(20), default=SessionStatus.PENDING.value, index=True)
    last_epoch = Column(Integer, default=-1)
    total_epochs = Column(Integer, default=100)
    last_seq = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    mongo_run_id = Column(String(100), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="training_sessions")
    project = relationship("Project", back_populates="training_sessions")
    experiment = relationship("Experiment", back_populates="training_sessions")
    snapshots = relationship(
        "SessionSnapshot",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionSnapshot.epoch",
    )


class SessionSnapshot(Base):
    __tablename__ = "session_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("training_sessions.id"), nullable=False)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=True, index=True)
    epoch = Column(Integer, nullable=False)
    mongo_doc_id = Column(String(100), nullable=True)
    blob_ref = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="snapshots")

    __table_args__ = (
        UniqueConstraint("session_id", "epoch", name="uq_session_epoch"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(50), nullable=False, index=True)
    target_type = Column(String(50), nullable=False, index=True)
    target_id = Column(String(100), nullable=True)
    details_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    actor = relationship("User", back_populates="audit_logs")
