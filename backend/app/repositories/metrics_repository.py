from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.metrics import FileMetrics


class MetricsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_file_id(self, file_id: int) -> FileMetrics | None:
        stmt = select(FileMetrics).where(FileMetrics.file_id == file_id)
        return self.db.execute(stmt).scalars().first()

    def upsert(
        self,
        file_id: int,
        degree: int,
        centrality: float,
        fan_in: int,
        fan_out: int,
    ) -> FileMetrics:
        existing = self.get_by_file_id(file_id)
        if existing:
            existing.degree = degree
            existing.centrality = centrality
            existing.fan_in = fan_in
            existing.fan_out = fan_out
            self.db.add(existing)
            self.db.flush()
            return existing

        metrics = FileMetrics(
            file_id=file_id,
            degree=degree,
            centrality=centrality,
            fan_in=fan_in,
            fan_out=fan_out,
        )
        self.db.add(metrics)
        self.db.flush()
        return metrics



