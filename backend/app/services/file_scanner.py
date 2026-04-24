from pathlib import Path
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.config import SUPPORTED_EXTENSIONS, MAX_FILE_SIZE
from app.utils.paths import should_ignore_path, get_file_type, normalize_path


class FileScanner:
    """Сервис для сканирования и поиска файлов в репозитории."""

    def __init__(self):
        self.supported_extensions = SUPPORTED_EXTENSIONS

    def scan_repository(self, repo_path: Path) -> List[Dict]:
        repo_path = Path(repo_path).resolve()

        # Собираем список файлов быстро — только метаданные
        candidates: List[Path] = []
        for file_path in repo_path.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in self.supported_extensions:
                continue
            if should_ignore_path(file_path):
                continue
            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    continue
            except (OSError, PermissionError):
                continue
            candidates.append(file_path)

        if not candidates:
            return []

        # Параллельно считаем sloc
        def process(file_path: Path) -> Dict | None:
            normalized_path = normalize_path(str(file_path), repo_path)
            file_type = get_file_type(str(file_path))
            sloc = self._count_sloc(file_path)
            return {
                "file_path": normalized_path,
                "absolute_path": file_path,
                "file_type": file_type,
                "sloc": sloc,
            }

        files: List[Dict] = []
        max_workers = min(8, len(candidates))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process, p): p for p in candidates}
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        files.append(result)
                except Exception:
                    pass

        return files

    def _count_sloc(self, file_path: Path) -> int:
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return 0

        sloc = 0
        in_block = False

        for line in content.splitlines():
            s = line.strip()
            if not s:
                continue
            if in_block:
                if "*/" in s:
                    in_block = False
                continue
            if "/*" in s:
                in_block = True
                if "*/" in s:
                    in_block = False
                continue
            if s.startswith("//"):
                continue
            if "//" in s:
                code = s.split("//")[0].strip()
                if code:
                    sloc += 1
                continue
            sloc += 1

        return sloc