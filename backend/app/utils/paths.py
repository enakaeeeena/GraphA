from pathlib import Path
from typing import List, Set, Optional
from app.config import SUPPORTED_EXTENSIONS, IGNORE_PATTERNS


def normalize_path(file_path: str, base_path: Path) -> str:
    """Нормализует путь файла относительно базового пути."""
    try:
        relative_path = Path(file_path).relative_to(base_path)
        return str(relative_path).replace("\\", "/")
    except ValueError:
        return file_path.replace("\\", "/")


def get_file_type(file_path: str) -> str:
    """Определяет тип файла по расширению."""
    ext = Path(file_path).suffix.lower()
    return ext.lstrip(".") if ext in SUPPORTED_EXTENSIONS else "unknown"


def should_ignore_path(path: Path) -> bool:
    """Проверяет, нужно ли игнорировать путь."""
    path_str = str(path)
    return any(pattern in path_str for pattern in IGNORE_PATTERNS)


def resolve_import_path(
    import_path: str,
    current_file: Path,
    base_path: Path,
    node_modules_path: Path = None
) -> Optional[Path]:
    """
    Разрешает путь импорта в абсолютный путь файла.
    
    Args:
        import_path: Путь из import/require
        current_file: Текущий файл, из которого делается импорт
        base_path: Базовый путь репозитория
        node_modules_path: Путь к node_modules (опционально)
    
    Returns:
        Path к файлу или None если не найден
    """
    # Абсолютный импорт (node_modules)
    if not import_path.startswith(".") and not import_path.startswith("/"):
        if node_modules_path:
            # Пробуем найти в node_modules
            possible_paths = [
                node_modules_path / import_path,
                node_modules_path / import_path / "index.js",
                node_modules_path / import_path / "index.ts",
            ]
            for path in possible_paths:
                if path.exists():
                    return path
        return None
    
    # Относительный импорт
    if import_path.startswith("."):
        # Убираем расширение если есть
        import_path = import_path.replace(".js", "").replace(".ts", "").replace(".jsx", "").replace(".tsx", "")
        
        # Строим путь относительно текущего файла
        current_dir = current_file.parent
        target_path = (current_dir / import_path).resolve()
        
        # Пробуем разные расширения
        extensions_to_try = ["", ".js", ".ts", ".jsx", ".tsx"]
        for ext in extensions_to_try:
            test_path = target_path.with_suffix(ext) if ext else target_path
            if test_path.exists() and test_path.is_file():
                return test_path
        
        # Пробуем index файлы в директории
        if target_path.is_dir() or not target_path.exists():
            for ext in [".js", ".ts", ".jsx", ".tsx"]:
                index_path = target_path / f"index{ext}"
                if index_path.exists() and index_path.is_file():
                    return index_path
        
        # Если не нашли, возвращаем предполагаемый путь
        return target_path
    
    return None


def extract_repo_name_from_url(repo_url: str) -> str:
    """Извлекает имя репозитория из URL."""
    # Убираем .git если есть
    repo_url = repo_url.rstrip(".git")
    # Извлекаем последнюю часть пути
    return repo_url.split("/")[-1]

