from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis_run import AnalysisRun


class AnalysisRunRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, run_id: int) -> AnalysisRun | None:
        return self.db.get(AnalysisRun, run_id)

    def get_latest_by_project(self, project_id: int) -> AnalysisRun | None:
        stmt = (
            select(AnalysisRun)
            .where(AnalysisRun.project_id == project_id)
            .order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc())
        )
        return self.db.execute(stmt).scalars().first()

    def create(self, project_id: int, commit_hash: str | None) -> AnalysisRun:
        run = AnalysisRun(project_id=project_id, commit_hash=commit_hash, status="processing")
        self.db.add(run)
        self.db.flush()
        return run

    def set_status(self, run: AnalysisRun, status: str, error: str | None = None) -> AnalysisRun:
        run.status = status
        run.error = error
        self.db.add(run)
        self.db.flush()
        return run



