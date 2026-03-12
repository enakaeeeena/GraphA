import re
from pathlib import Path
from typing import List, Dict
from app.utils.paths import resolve_import_path


class DependencyParser:
    """Сервис для парсинга импортов и зависимостей из JS/TS файлов."""
    
    def __init__(self):
        # Паттерны для различных типов импортов
        self.import_patterns = [
            # ES6 imports: import ... from '...'
            (r"import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]", "es6"),
            # require: require('...')
            (r"require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)", "require"),
            # dynamic import: import('...')
            (r"import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)", "dynamic"),
            # export from: export ... from '...'
            (r"export\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]", "export"),
        ]
    
    def parse_file(self, file_path: Path, repo_base_path: Path) -> List[Dict]:
        """
        Парсит файл и извлекает все импорты.
        
        Args:
            file_path: Путь к файлу для парсинга
            repo_base_path: Базовый путь репозитория
        
        Returns:
            Список словарей с информацией об импортах:
            [
                {
                    "import_path": "./Button",
                    "import_type": "relative",
                    "resolved_path": Optional[Path]
                },
                ...
            ]
        """
        dependencies = []
        
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            return dependencies
        
        # Ищем все импорты
        found_imports = set()
        
        for pattern, import_kind in self.import_patterns:
            matches = re.finditer(pattern, content, re.MULTILINE)
            for match in matches:
                import_path = match.group(1) if match.groups() else match.group(0)
                
                # Пропускаем пустые импорты
                if not import_path or import_path in found_imports:
                    continue
                
                found_imports.add(import_path)
                
                # Определяем тип импорта
                import_type = self._classify_import(import_path)
                
                # Пытаемся разрешить путь
                resolved_path = None
                if import_type != "node_modules":
                    resolved_path = resolve_import_path(
                        import_path,
                        file_path,
                        repo_base_path
                    )
                
                dependencies.append({
                    "import_path": import_path,
                    "import_type": import_type,
                    "resolved_path": resolved_path
                })
        
        return dependencies
    
    def _classify_import(self, import_path: str) -> str:
        """
        Классифицирует тип импорта.
        
        Returns:
            "relative" - относительный импорт (./ или ../)
            "absolute" - абсолютный импорт (/)
            "node_modules" - импорт из node_modules
        """
        if import_path.startswith("."):
            return "relative"
        elif import_path.startswith("/"):
            return "absolute"
        else:
            return "node_modules"
    
    def parse_files(self, files: List[Dict], repo_base_path: Path) -> Dict[str, List[Dict]]:
        """
        Парсит несколько файлов и возвращает зависимости для каждого.
        
        Args:
            files: Список файлов из file_scanner
            repo_base_path: Базовый путь репозитория
        
        Returns:
            Словарь {file_path: [dependencies]}
        """
        result = {}
        repo_base_path = Path(repo_base_path).resolve()
        
        for file_info in files:
            absolute_path = file_info["absolute_path"]
            file_path = file_info["file_path"]
            
            dependencies = self.parse_file(absolute_path, repo_base_path)
            result[file_path] = dependencies
        
        return result

