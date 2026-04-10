from __future__ import annotations

from pydantic import BaseModel


class FileMetricsRead(BaseModel):
    degree: int
    centrality: float
    fan_in: int
    fan_out: int

    class Config:
        from_attributes = True


class FileNodeRead(BaseModel):
    id: int
    file_path: str
    file_type: str
    lines_count: int
    metrics: FileMetricsRead | None = None

    class Config:
        from_attributes = True


class DependencyEdgeRead(BaseModel):
    id: int
    source_file_id: int
    target_file_id: int
    dependency_type: str
    import_path: str | None = None

    class Config:
        from_attributes = True


class GraphDataRead(BaseModel):
    nodes: list[dict]
    links: list[dict]


class ProjectGraphResponse(BaseModel):
    project_id: int
    analysis_run_id: int
    graph: GraphDataRead


class MetricsResponse(BaseModel):
    project_id: int
    analysis_run_id: int
    metrics: list[FileNodeRead]



