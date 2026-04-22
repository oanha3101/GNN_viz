from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(100))
    is_active = Column(Boolean, default=True)
    profile_image = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="owner")

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
