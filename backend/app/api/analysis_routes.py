from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import SessionLocal, get_db
from app.repositories.project_repository import ProjectRepository
from app.schemas.project_schema import AnalysisRunRead
from app.services.analysis_service import AnalysisService
from app.repositories.analysis_run_repository import AnalysisRunRepository


router = APIRouter(tags=["analysis"])

def _run_analysis_background(run_id: int, repo_url: str) -> None:
    db = SessionLocal()
    try:
        AnalysisService(db).run_analysis(run_id, repo_url)
    finally:
        db.close()


@router.post("/projects/{project_id}/analyze", response_model=AnalysisRunRead)
def analyze_project(project_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    projects = ProjectRepository(db)
    project = projects.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    service = AnalysisService(db)
    run_id = service.start_analysis(project_id=project.id, repo_url=project.repo_url)

    # Run analysis in background with a separate DB session.
    background.add_task(_run_analysis_background, run_id, project.repo_url)

    run_repo = AnalysisRunRepository(db)
    run = run_repo.get_by_id(run_id)
    if not run:
        raise HTTPException(status_code=500, detail="Не удалось создать запуск анализа")
    return run


@router.get("/runs/{run_id}", response_model=AnalysisRunRead)
def get_run(run_id: int, db: Session = Depends(get_db)):
    repo = AnalysisRunRepository(db)
    run = repo.get_by_id(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Запуск анализа не найден")
    return run


