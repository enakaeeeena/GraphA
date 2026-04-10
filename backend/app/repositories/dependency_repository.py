from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.dependency import DependencyEdge


class DependencyRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_source_ids(self, source_file_ids: list[int]) -> list[DependencyEdge]:
        if not source_file_ids:
            return []
        stmt = select(DependencyEdge).where(DependencyEdge.source_file_id.in_(source_file_ids))
        return list(self.db.execute(stmt).scalars().all())

    def create(
        self,
        source_file_id: int,
        target_file_id: int,
        dependency_type: str,
        import_path: str | None = None,
    ) -> DependencyEdge:
        edge = DependencyEdge(
            source_file_id=source_file_id,
            target_file_id=target_file_id,
            dependency_type=dependency_type,
            import_path=import_path,
        )
        self.db.add(edge)
        self.db.flush()
        return edge



