from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, HttpUrl


class RepositoryBase(BaseModel):
    url: str
    name: str


class Repository(RepositoryBase):
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnalysisSessionBase(BaseModel):
    session_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str  # "pending", "processing", "completed", "failed"


class AnalysisSession(AnalysisSessionBase):
    repository_url: str

    class Config:
        from_attributes = True


class ImportDependencyBase(BaseModel):
    import_path: str
    import_type: str  # "relative", "absolute", "node_modules"


class ImportDependency(ImportDependencyBase):
    class Config:
        from_attributes = True


class FileMetricsBase(BaseModel):
    in_degree: int = 0
    out_degree: int = 0
    centrality: float = 0.0


class FileMetrics(FileMetricsBase):
    class Config:
        from_attributes = True


class SourceFileBase(BaseModel):
    file_path: str
    file_type: str  # "js", "ts", "jsx", "tsx"
    sloc: int = 0  # Source Lines of Code


class SourceFile(SourceFileBase):
    dependencies: List[ImportDependency] = []
    metrics: Optional[FileMetrics] = None

    class Config:
        from_attributes = True


# Request/Response схемы для API
class AnalyzeRequest(BaseModel):
    repo_url: str


class AnalyzeResponse(BaseModel):
    session_id: str
    status: str
    repository: Repository
    files: List[SourceFile]
    graph_data: dict  # Данные для D3.js


class GraphNode(BaseModel):
    id: str
    file_path: str
    file_type: str
    metrics: FileMetrics


class GraphEdge(BaseModel):
    source: str
    target: str
    import_path: str
    import_type: str


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]

