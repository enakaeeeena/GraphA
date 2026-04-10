from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    repo_url: str


class ProjectRead(BaseModel):
    id: int
    name: str
    repo_url: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisRunRead(BaseModel):
    id: int
    project_id: int
    commit_hash: str | None
    created_at: datetime
    status: str
    error: str | None

    class Config:
        from_attributes = True



