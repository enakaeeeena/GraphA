"""Поиск циклических рёбер (SCC / Косараджу) в графе зависимостей."""

from __future__ import annotations

import networkx as nx


def compute_cycle_edges(graph: nx.DiGraph) -> set[tuple[str, str]]:
    """Все рёбра, входящие в strongly connected component размера > 1 или в самоцикл."""
    cycle_edges: set[tuple[str, str]] = set()

    for scc in nx.strongly_connected_components(graph):
        if len(scc) > 1:
            for u, v in graph.subgraph(scc).edges():
                cycle_edges.add((u, v))
        else:
            node = next(iter(scc))
            if graph.has_edge(node, node):
                cycle_edges.add((node, node))

    return cycle_edges
