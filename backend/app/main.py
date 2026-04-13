from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analysis_routes import router as analysis_router
from app.api.graph_routes import router as graph_router
from app.api.metrics_routes import router as metrics_router
from app.api.project_routes import router as project_router
from app.config import API_PREFIX
from app.database.base import Base
from app.database.session import engine

# import ORM models so SQLAlchemy sees them in metadata
from app import models  # noqa: F401

app = FastAPI(
    title="Code Dependency Analyzer",
    description="API для анализа зависимостей в JavaScript/TypeScript проектах",
    version="1.0.0"
)

# CORS middleware для работы с фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup() -> None:
    # For a diploma/research project SQLite is fine; for production use Alembic migrations.
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"status": "ok", "service": "Code Dependency Analyzer", "version": "1.0.0"}


@app.get(f"{API_PREFIX}/health")
def health_check():
    return {"status": "healthy"}


# New architecture routers
app.include_router(project_router, prefix=API_PREFIX)
app.include_router(analysis_router, prefix=API_PREFIX)
app.include_router(graph_router, prefix=API_PREFIX)
app.include_router(metrics_router, prefix=API_PREFIX)

