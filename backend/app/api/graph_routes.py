from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.graph_schema import ProjectGraphResponse
from app.services.graph_service import GraphService


router = APIRouter(tags=["graph"])


@router.get("/projects/{project_id}/graph", response_model=ProjectGraphResponse)
def get_project_graph(
    project_id: int,
    run_id: int | None = Query(default=None, description="ID конкретного запуска анализа (по умолчанию — последний)"),
    db: Session = Depends(get_db),
):
    service = GraphService(db)
    result = service.get_graph_d3(project_id=project_id, analysis_run_id=run_id)
    if not result:
        raise HTTPException(status_code=404, detail="Граф не найден (нет запусков анализа?)")
    analysis_run_id, graph = result
    return ProjectGraphResponse(project_id=project_id, analysis_run_id=analysis_run_id, graph=graph)



