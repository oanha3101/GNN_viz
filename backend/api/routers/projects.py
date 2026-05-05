from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.routers.auth import get_optional_user
from database import get_db
from models.sql_models import User
from services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: Optional[int] = None
    model_type: Optional[str] = None
    is_public: bool = False


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[int] = None
    model_type: Optional[str] = None
    is_public: Optional[bool] = None

@router.post("")
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return project_service.create_project(
        db,
        title=payload.title,
        description=payload.description,
        task_type=payload.task_type,
        model_type=payload.model_type,
        is_public=payload.is_public,
        user=user,
    )


@router.get("")
def list_projects(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return project_service.list_projects(db, user)


@router.get("/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return project_service.get_project_payload(db, project_id, user)


@router.patch("/{project_id}")
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    return project_service.update_project(
        db,
        project_id,
        payload.model_dump(exclude_unset=True),
        user,
    )
