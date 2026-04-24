from __future__ import annotations

from pathlib import Path

from git import Repo
from sqlalchemy.orm import Session

from app.repositories.analysis_run_repository import AnalysisRunRepository
from app.repositories.dependency_repository import DependencyRepository
from app.repositories.file_repository import FileRepository
from app.repositories.metrics_repository import MetricsRepository
from app.repositories.project_repository import ProjectRepository
from app.services.repo_loader import RepositoryLoader
from app.graph.dependency_extractor import DependencyExtractor
from app.graph.graph_builder import GraphBuilderService


class AnalysisService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.projects = ProjectRepository(db)
        self.runs = AnalysisRunRepository(db)
        self.files = FileRepository(db)
        self.edges = DependencyRepository(db)
        self.metrics = MetricsRepository(db)

        self.repo_loader = RepositoryLoader()
        self.extractor = DependencyExtractor()
        self.graph_builder = GraphBuilderService()

    def create_project_if_needed(self, name: str, repo_url: str):
        existing = self.projects.get_by_repo_url(repo_url)
        if existing:
            return existing
        project = self.projects.create(name=name, repo_url=repo_url)
        self.db.commit()
        self.db.refresh(project)
        return project

    def start_analysis(self, project_id: int, repo_url: str) -> int:
        # Клонируем репозиторий и сразу получаем commit hash
        repo_path = self.repo_loader.clone_repository(repo_url)
        commit_hash = self._get_commit_hash(repo_path)

        # Создаём запись о запуске — анализ запустит background task
        run = self.runs.create(project_id=project_id, commit_hash=commit_hash)
        self.db.commit()

        return run.id

    def run_analysis(self, run_id: int, repo_url: str) -> None:
        """Fallback — клонирует если нет пути (для совместимости)."""
        repo_path = self.repo_loader.clone_repository(repo_url)
        self.run_analysis_with_path(run_id, repo_path)

    def run_analysis_with_path(self, run_id: int, repo_path: Path) -> None:
        """Основной анализ — принимает уже готовый путь без повторного клонирования."""
        run = self.runs.get_by_id(run_id)
        if not run:
            return

        try:
            files_data, deps_data = self.extractor.extract(repo_path)
            if not files_data:
                raise RuntimeError("Не найдено поддерживаемых файлов в репозитории")

            self.graph_builder.build_graph(files_data, deps_data)
            metrics_map = self.graph_builder.calculate_metrics()

            # Сохраняем узлы пакетом
            file_id_by_path: dict[str, int] = {}
            for file_info in files_data:
                node = self.files.create(
                    project_id=run.project_id,
                    analysis_run_id=run.id,
                    file_path=file_info["file_path"],
                    file_type=file_info["file_type"],
                    lines_count=int(file_info.get("sloc", 0)),
                )
                file_id_by_path[file_info["file_path"]] = node.id

            # Сохраняем рёбра
            for source, target, edge_data in self.graph_builder.graph.edges(data=True):
                source_id = file_id_by_path.get(source)
                target_id = file_id_by_path.get(target)
                if not source_id or not target_id:
                    continue
                self.edges.create(
                    source_file_id=source_id,
                    target_file_id=target_id,
                    dependency_type=edge_data.get("dependency_type", "unknown") or "unknown",
                    import_path=edge_data.get("import_path"),
                )

            # Сохраняем метрики
            for file_path, m in metrics_map.items():
                file_id = file_id_by_path.get(file_path)
                if not file_id:
                    continue
                self.metrics.upsert(
                    file_id=file_id,
                    degree=m.degree,
                    centrality=m.centrality,
                    fan_in=m.fan_in,
                    fan_out=m.fan_out,
                )

            self.runs.set_status(run, "completed", error=None)
            self.db.commit()
        except Exception as e:
            self.runs.set_status(run, "failed", error=str(e))
            self.db.commit()

    def _get_commit_hash(self, repo_path: Path) -> str | None:
        try:
            repo = Repo(repo_path)
            return repo.head.commit.hexsha
        except Exception:
            return None