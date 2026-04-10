from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project


class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, project_id: int) -> Project | None:
        return self.db.get(Project, project_id)

    def get_by_repo_url(self, repo_url: str) -> Project | None:
        stmt = select(Project).where(Project.repo_url == repo_url)
        return self.db.execute(stmt).scalars().first()

    def create(self, name: str, repo_url: str) -> Project:
        project = Project(name=name, repo_url=repo_url)
        self.db.add(project)
        self.db.flush()  # populate PK
        return project



