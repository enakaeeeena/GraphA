from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.repositories.project_repository import ProjectRepository
from app.schemas.project_schema import ProjectCreate, ProjectRead


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectRead)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    repo = ProjectRepository(db)
    existing = repo.get_by_repo_url(payload.repo_url)
    if existing:
        return existing
    project = repo.create(name=payload.name, repo_url=payload.repo_url)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, db: Session = Depends(get_db)):
    repo = ProjectRepository(db)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project



