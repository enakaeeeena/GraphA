import networkx as nx
from typing import Dict, List, Optional
from pathlib import Path
from app.models.schemas import FileMetrics


class GraphBuilder:
    """Сервис для построения графов зависимостей и вычисления метрик."""
    
    def __init__(self):
        self.graph = nx.DiGraph()
    
    def build_graph(
        self,
        files: List[Dict],
        dependencies: Dict[str, List[Dict]]
    ) -> nx.DiGraph:
        """
        Строит граф зависимостей между файлами.
        
        Args:
            files: Список файлов из file_scanner
            dependencies: Словарь зависимостей из parser
        
        Returns:
            NetworkX DiGraph с узлами (файлы) и рёбрами (зависимости)
        """
        self.graph = nx.DiGraph()
        
        # Добавляем узлы (файлы)
        for file_info in files:
            file_path = file_info["file_path"]
            self.graph.add_node(
                file_path,
                file_type=file_info["file_type"],
                sloc=file_info["sloc"]
            )
        
        # Добавляем рёбра (зависимости)
        for file_path, deps in dependencies.items():
            if file_path not in self.graph:
                continue
            
            for dep in deps:
                import_path = dep["import_path"]
                import_type = dep["import_type"]
                resolved_path = dep.get("resolved_path")
                
                # Если путь разрешён, создаём ребро
                if resolved_path:
                    # Находим соответствующий файл в графе
                    target_file = self._find_file_in_graph(resolved_path, files)
                    if target_file:
                        self.graph.add_edge(
                            file_path,
                            target_file,
                            import_path=import_path,
                            import_type=import_type
                        )
                # Если это node_modules или неразрешённый путь, всё равно добавляем информацию
                elif import_type == "node_modules":
                    # Можно добавить виртуальный узел для node_modules
                    pass
        
        return self.graph
    
    def _find_file_in_graph(self, resolved_path: Path, files: List[Dict]) -> Optional[str]:
        """Находит файл в списке файлов по абсолютному пути."""
        resolved_path = resolved_path.resolve()
        for file_info in files:
            if Path(file_info["absolute_path"]).resolve() == resolved_path:
                return file_info["file_path"]
        return None
    
    def calculate_metrics(self) -> Dict[str, FileMetrics]:
        """
        Вычисляет метрики для каждого файла в графе.
        
        Returns:
            Словарь {file_path: FileMetrics}
        """
        metrics = {}
        
        for node in self.graph.nodes():
            # In-degree (сколько файлов импортируют этот файл)
            in_degree = self.graph.in_degree(node)
            
            # Out-degree (сколько файлов импортирует этот файл)
            out_degree = self.graph.out_degree(node)
            
            # Centrality (мера центральности узла)
            try:
                centrality = nx.betweenness_centrality(self.graph)[node]
            except:
                centrality = 0.0
            
            metrics[node] = FileMetrics(
                in_degree=in_degree,
                out_degree=out_degree,
                centrality=float(centrality)
            )
        
        return metrics
    
    def get_graph_data_for_d3(self) -> Dict:
        """
        Преобразует граф в формат для D3.js.
        
        Returns:
            Словарь с nodes и links для D3.js
        """
        metrics = self.calculate_metrics()
        
        nodes = []
        for node in self.graph.nodes():
            node_data = self.graph.nodes[node]
            node_metrics = metrics[node]
            
            nodes.append({
                "id": node,
                "file_path": node,
                "file_type": node_data.get("file_type", "unknown"),
                "sloc": node_data.get("sloc", 0),
                "metrics": {
                    "in_degree": node_metrics.in_degree,
                    "out_degree": node_metrics.out_degree,
                    "centrality": node_metrics.centrality
                }
            })
        
        links = []
        for source, target, edge_data in self.graph.edges(data=True):
            links.append({
                "source": source,
                "target": target,
                "import_path": edge_data.get("import_path", ""),
                "import_type": edge_data.get("import_type", "unknown")
            })
        
        return {
            "nodes": nodes,
            "links": links
        }
    
    def get_statistics(self) -> Dict:
        """Возвращает статистику по графу."""
        if not self.graph.nodes():
            return {}
        
        return {
            "total_files": len(self.graph.nodes()),
            "total_dependencies": len(self.graph.edges()),
            "average_in_degree": sum(self.graph.in_degree(n) for n in self.graph.nodes()) / len(self.graph.nodes()),
            "average_out_degree": sum(self.graph.out_degree(n) for n in self.graph.nodes()) / len(self.graph.nodes()),
            "is_connected": nx.is_weakly_connected(self.graph),
            "num_components": nx.number_weakly_connected_components(self.graph)
        }

