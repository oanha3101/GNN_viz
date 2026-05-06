from datetime import timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.sql_models import Project, User
from services.list_response import build_list_response


def serialize_project(project: Project) -> dict:
    created_at = project.created_at
    if created_at and created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "task_type": project.task_type,
        "model_type": project.model_type,
        "is_public": project.is_public,
        "owner_id": project.owner_id,
        "created_at": created_at.isoformat() if created_at else "",
    }


def ensure_project_write_access(project: Project, user: Optional[User]) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin":
        return
    if user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot modify projects")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this project")


def ensure_project_read_access(project: Project, user: Optional[User]) -> None:
    if user is None:
        return
    if user.is_superuser or user.role == "admin" or project.is_public:
        return
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed to access this project")


def create_project(
    db: Session,
    *,
    title: str,
    description: Optional[str],
    task_type: Optional[int],
    model_type: Optional[str],
    is_public: bool,
    user: Optional[User],
) -> dict:
    if user and user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewer accounts cannot create projects")
    project = Project(
        title=title,
        description=description,
        task_type=task_type,
        model_type=model_type,
        is_public=is_public,
        owner_id=user.id if user else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


def list_projects(db: Session, user: Optional[User]) -> dict:
    query = db.query(Project)
    if user and not (user.is_superuser or user.role == "admin"):
        query = query.filter(
            (Project.owner_id == user.id)
            | (Project.is_public.is_(True))
            | (Project.owner_id.is_(None))
        )
    rows = query.order_by(Project.created_at.desc()).all()
    return build_list_response([serialize_project(row) for row in rows])


def get_project_by_id(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_project_payload(db: Session, project_id: int, user: Optional[User]) -> dict:
    project = get_project_by_id(db, project_id)
    ensure_project_read_access(project, user)
    return serialize_project(project)


def update_project(db: Session, project_id: int, updates: dict, user: Optional[User]) -> dict:
    project = get_project_by_id(db, project_id)
    ensure_project_write_access(project, user)
    for field, value in updates.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return serialize_project(project)
