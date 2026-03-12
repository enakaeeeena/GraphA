from pathlib import Path
from typing import List, Dict
from app.config import SUPPORTED_EXTENSIONS, MAX_FILE_SIZE
from app.utils.paths import should_ignore_path, get_file_type, normalize_path


class FileScanner:
    """Сервис для сканирования и поиска файлов в репозитории."""
    
    def __init__(self):
        self.supported_extensions = SUPPORTED_EXTENSIONS
    
    def scan_repository(self, repo_path: Path) -> List[Dict]:
        """
        Сканирует репозиторий и находит все поддерживаемые файлы.
        
        Args:
            repo_path: Путь к корню репозитория
        
        Returns:
            Список словарей с информацией о файлах:
            [
                {
                    "file_path": "src/components/Button.tsx",
                    "absolute_path": Path(...),
                    "file_type": "tsx",
                    "sloc": 150
                },
                ...
            ]
        """
        files = []
        repo_path = Path(repo_path).resolve()
        
        for file_path in repo_path.rglob("*"):
            # Пропускаем директории
            if not file_path.is_file():
                continue
            
            # Проверяем расширение
            if file_path.suffix.lower() not in self.supported_extensions:
                continue
            
            # Проверяем, нужно ли игнорировать
            if should_ignore_path(file_path):
                continue
            
            # Проверяем размер файла
            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    continue
            except (OSError, PermissionError):
                continue
            
            # Нормализуем путь
            normalized_path = normalize_path(str(file_path), repo_path)
            file_type = get_file_type(str(file_path))
            
            # Подсчитываем строки кода (упрощенный вариант)
            sloc = self._count_sloc(file_path)
            
            files.append({
                "file_path": normalized_path,
                "absolute_path": file_path,
                "file_type": file_type,
                "sloc": sloc
            })
        
        return files
    
    def _count_sloc(self, file_path: Path) -> int:
        """
        Подсчитывает количество строк кода (Source Lines of Code).
        Учитывает только непустые строки, не комментарии.
        """
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            
            sloc = 0
            in_multiline_comment = False
            
            for line in lines:
                stripped = line.strip()
                
                # Пропускаем пустые строки
                if not stripped:
                    continue
                
                # Обработка многострочных комментариев
                if "/*" in stripped:
                    in_multiline_comment = True
                    if "*/" in stripped:
                        in_multiline_comment = False
                        continue
                    continue
                
                if in_multiline_comment:
                    if "*/" in stripped:
                        in_multiline_comment = False
                    continue
                
                # Пропускаем однострочные комментарии
                if stripped.startswith("//"):
                    continue
                
                # Пропускаем комментарии в конце строки (упрощенно)
                if "//" in stripped and not stripped.startswith("//"):
                    # Убираем комментарий и проверяем, осталось ли что-то
                    code_part = stripped.split("//")[0].strip()
                    if code_part:
                        sloc += 1
                    continue
                
                sloc += 1
            
            return sloc
        except Exception:
            return 0

