from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.file_node import FileNode


class FileRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_by_run(self, analysis_run_id: int) -> list[FileNode]:
        stmt = select(FileNode).where(FileNode.analysis_run_id == analysis_run_id)
        return list(self.db.execute(stmt).scalars().all())

    def get_by_run_and_path(self, analysis_run_id: int, file_path: str) -> FileNode | None:
        stmt = select(FileNode).where(
            FileNode.analysis_run_id == analysis_run_id,
            FileNode.file_path == file_path,
        )
        return self.db.execute(stmt).scalars().first()

    def create(
        self,
        project_id: int,
        analysis_run_id: int,
        file_path: str,
        file_type: str,
        lines_count: int,
    ) -> FileNode:
        node = FileNode(
            project_id=project_id,
            analysis_run_id=analysis_run_id,
            file_path=file_path,
            file_type=file_type,
            lines_count=lines_count,
        )
        self.db.add(node)
        self.db.flush()
        return node



