from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import networkx as nx


@dataclass(frozen=True)
class CalculatedMetrics:
    degree: int
    centrality: float
    fan_in: int
    fan_out: int


class GraphBuilderService:
    """Build dependency graph and calculate metrics from extracted files/dependencies."""

    def __init__(self) -> None:
        self.graph = nx.DiGraph()

    def build_graph(self, files: List[Dict], dependencies: Dict[str, List[Dict]]) -> nx.DiGraph:
        self.graph = nx.DiGraph()

        for file_info in files:
            file_path = file_info["file_path"]
            self.graph.add_node(
                file_path,
                file_type=file_info["file_type"],
                lines_count=file_info["sloc"],
            )

        for file_path, deps in dependencies.items():
            if file_path not in self.graph:
                continue
            for dep in deps:
                resolved_path = dep.get("resolved_path")
                if not resolved_path:
                    continue
                target_file = self._find_file_in_graph(resolved_path, files)
                if not target_file:
                    continue
                self.graph.add_edge(
                    file_path,
                    target_file,
                    import_path=dep.get("import_path"),
                    dependency_type=dep.get("import_type"),
                )

        return self.graph

    def _find_file_in_graph(self, resolved_path: Path, files: List[Dict]) -> Optional[str]:
        resolved_path = resolved_path.resolve()
        for file_info in files:
            if Path(file_info["absolute_path"]).resolve() == resolved_path:
                return file_info["file_path"]
        return None

    def calculate_metrics(self) -> dict[str, CalculatedMetrics]:
        if not self.graph.nodes:
            return {}

        try:
            centrality_map = nx.betweenness_centrality(self.graph)
        except Exception:
            centrality_map = {n: 0.0 for n in self.graph.nodes()}

        metrics: dict[str, CalculatedMetrics] = {}
        for node in self.graph.nodes():
            fan_in = int(self.graph.in_degree(node))
            fan_out = int(self.graph.out_degree(node))
            degree = fan_in + fan_out
            centrality = float(centrality_map.get(node, 0.0))
            metrics[node] = CalculatedMetrics(
                degree=degree,
                centrality=centrality,
                fan_in=fan_in,
                fan_out=fan_out,
            )
        return metrics

    def to_d3(self) -> dict:
        metrics = self.calculate_metrics()
        nodes = []
        for node in self.graph.nodes():
            data = self.graph.nodes[node]
            m = metrics.get(node)
            nodes.append(
                {
                    "id": node,
                    "file_path": node,
                    "file_type": data.get("file_type", "unknown"),
                    "lines_count": data.get("lines_count", 0),
                    "metrics": None
                    if not m
                    else {
                        "degree": m.degree,
                        "centrality": m.centrality,
                        "fan_in": m.fan_in,
                        "fan_out": m.fan_out,
                    },
                }
            )

        links = []
        for source, target, edge_data in self.graph.edges(data=True):
            links.append(
                {
                    "source": source,
                    "target": target,
                    "dependency_type": edge_data.get("dependency_type", "unknown"),
                    "import_path": edge_data.get("import_path"),
                }
            )

        return {"nodes": nodes, "links": links}



