from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database.session import get_db
from app.models.file_node import FileNode
from app.repositories.analysis_run_repository import AnalysisRunRepository
from app.schemas.graph_schema import MetricsResponse, FileNodeRead


router = APIRouter(tags=["metrics"])


@router.get("/projects/{project_id}/metrics", response_model=MetricsResponse)
def get_project_metrics(
    project_id: int,
    run_id: int | None = Query(default=None, description="ID конкретного запуска анализа (по умолчанию — последний)"),
    db: Session = Depends(get_db),
):
    runs = AnalysisRunRepository(db)
    run = runs.get_latest_by_project(project_id) if run_id is None else runs.get_by_id(run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(status_code=404, detail="Метрики не найдены (нет запусков анализа?)")

    nodes = db.execute(
        select(FileNode)
        .options(joinedload(FileNode.metrics))
        .where(FileNode.analysis_run_id == run.id)
        .order_by(FileNode.file_path.asc())
    ).scalars().all()

    # Pydantic model can be created via from_attributes due to Config.from_attributes
    return MetricsResponse(
        project_id=project_id,
        analysis_run_id=run.id,
        metrics=[FileNodeRead.model_validate(n) for n in nodes],
    )



