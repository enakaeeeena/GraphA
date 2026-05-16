from __future__ import annotations

import networkx as nx
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.graph.cycles import compute_cycle_edges
from app.models.file_node import FileNode
from app.models.dependency import DependencyEdge
from app.repositories.analysis_run_repository import AnalysisRunRepository
from app.repositories.file_repository import FileRepository


class GraphService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.runs = AnalysisRunRepository(db)
        self.files = FileRepository(db)

    def get_run_or_latest(self, project_id: int, analysis_run_id: int | None):
        if analysis_run_id is not None:
            run = self.runs.get_by_id(analysis_run_id)
            if run and run.project_id == project_id:
                return run
            return None
        return self.runs.get_latest_by_project(project_id)

    def get_graph_d3(self, project_id: int, analysis_run_id: int | None) -> tuple[int, dict] | None:
        run = self.get_run_or_latest(project_id, analysis_run_id)
        if not run:
            return None

        nodes = self.db.execute(
            select(FileNode)
            .options(joinedload(FileNode.metrics))
            .where(FileNode.analysis_run_id == run.id)
        ).scalars().all()

        node_ids = [n.id for n in nodes]
        edges = self.db.execute(
            select(DependencyEdge).where(DependencyEdge.source_file_id.in_(node_ids))
        ).scalars().all()

        id_to_path = {n.id: n.file_path for n in nodes}

        # Старые снапшоты без is_cycle: колонка есть, но везде 0 — пересчитываем SCC
        has_cycle_column = bool(edges) and hasattr(edges[0], "is_cycle")
        stored_cycle_flags = [bool(e.is_cycle) for e in edges] if has_cycle_column else []
        need_recompute = bool(edges) and (
            not has_cycle_column or not any(stored_cycle_flags)
        )
        cycle_edges: set[tuple[str, str]] = set()
        if need_recompute:
            g = nx.DiGraph()
            g.add_nodes_from(id_to_path.values())
            for e in edges:
                src = id_to_path.get(e.source_file_id)
                tgt = id_to_path.get(e.target_file_id)
                if src and tgt:
                    g.add_edge(src, tgt)
            cycle_edges = compute_cycle_edges(g)

        d3_nodes = []
        for n in nodes:
            d3_nodes.append(
                {
                    "id": n.file_path,
                    "file_path": n.file_path,
                    "file_type": n.file_type,
                    "lines_count": n.lines_count,
                    "metrics": None
                    if not n.metrics
                    else {
                        "degree": n.metrics.degree,
                        "centrality": n.metrics.centrality,
                        "fan_in": n.metrics.fan_in,
                        "fan_out": n.metrics.fan_out,
                        "cycles": getattr(n.metrics, "cycles", 0),
                    },
                }
            )

        d3_links = []
        for e in edges:
            source = id_to_path.get(e.source_file_id, str(e.source_file_id))
            target = id_to_path.get(e.target_file_id, str(e.target_file_id))
            is_cycle = bool(getattr(e, "is_cycle", False))
            if need_recompute:
                is_cycle = (source, target) in cycle_edges
            d3_links.append(
                {
                    "source": source,
                    "target": target,
                    "dependency_type": e.dependency_type,
                    "import_path": e.import_path,
                    "is_cycle": is_cycle,
                }
            )

        return run.id, {"nodes": d3_nodes, "links": d3_links}
