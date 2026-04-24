from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, JSON, UniqueConstraint, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base
import enum


class SessionStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    profile_image = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")
    training_sessions = relationship("TrainingSession", back_populates="user")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    task_type = Column(Integer)  # 1-6 mapping to the 6 tasks
    model_type = Column(String(20)) # GCN, GAT, SAGE
    is_public = Column(Boolean, default=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="projects")
    experiments = relationship("Experiment", back_populates="project", cascade="all, delete-orphan")

class Experiment(Base):
    __tablename__ = "experiments"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    task_type = Column(Integer, default=1)        # 1-6
    model_type = Column(String(20), default='GCN') # GCN, GAT, SAGE
    dataset_name = Column(String(50), default='cora')
    epoch_count = Column(Integer)
    learning_rate = Column(Float)
    hidden_dim = Column(Integer)
    dropout = Column(Float)
    accuracy = Column(Float)
    loss = Column(Float)
    
    # Standard: References a document in MongoDB
    mongo_doc_id = Column(String(50)) 
    
    # Fallback/Legacy: Stores heavy data directly in SQL if Mongo is missing
    config_json = Column(JSON)
    snapshots_json = Column(JSON)
    graph_data_json = Column(JSON)
    ground_truth_json = Column(JSON)
    task_data_json = Column(JSON)

    is_best = Column(Boolean, default=False)
    is_mock = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="experiments")


class TrainingSession(Base):
    """Persistent training session — survives WS disconnect."""
    __tablename__ = "training_sessions"
    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    task_type = Column(Integer, nullable=False)  # 1-6
    model_type = Column(String(20), default="GCN")
    dataset_name = Column(String(100), default="cora")
    config_json = Column(JSON)  # Full training config
    status = Column(String(20), default=SessionStatus.PENDING.value)
    last_epoch = Column(Integer, default=-1)
    total_epochs = Column(Integer, default=100)
    last_seq = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    user = relationship("User", back_populates="training_sessions")
    snapshots = relationship("SessionSnapshot", back_populates="session",
                            cascade="all, delete-orphan",
                            order_by="SessionSnapshot.epoch")


class SessionSnapshot(Base):
    """Per-epoch snapshot blob reference."""
    __tablename__ = "session_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(36), ForeignKey("training_sessions.id"), nullable=False)
    epoch = Column(Integer, nullable=False)
    blob_ref = Column(String(500), nullable=False)  # Path to .json.gz file
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TrainingSession", back_populates="snapshots")

    __table_args__ = (
        UniqueConstraint('session_id', 'epoch', name='uq_session_epoch'),
    )
