import os
from pathlib import Path
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.config import SUPPORTED_EXTENSIONS, MAX_FILE_SIZE, IGNORE_DIR_NAMES
from app.utils.paths import get_file_type, normalize_path


class FileScanner:
    """Сервис для сканирования и поиска файлов в репозитории."""

    def __init__(self):
        self.supported_extensions = SUPPORTED_EXTENSIONS

    def scan_repository(self, repo_path: Path) -> List[Dict]:
        repo_path = Path(repo_path).resolve()

        candidates: List[Path] = []
        supported = set(self.supported_extensions)

        # os.walk с отсечением тяжёлых каталогов — не обходим node_modules и т.п.
        for root, dirnames, filenames in os.walk(repo_path, topdown=True):
            # Пропускаем только тяжёлые/служебные каталоги (не все dot-папки)
            dirnames[:] = [d for d in dirnames if d not in IGNORE_DIR_NAMES]
            root_path = Path(root)
            for name in filenames:
                file_path = root_path / name
                if file_path.suffix.lower() not in supported:
                    continue
                try:
                    if file_path.stat().st_size > MAX_FILE_SIZE:
                        continue
                except (OSError, PermissionError):
                    continue
                candidates.append(file_path)

        if not candidates:
            return []

        def process(file_path: Path) -> Dict | None:
            try:
                content = file_path.read_bytes()
            except Exception:
                return None
            if len(content) > MAX_FILE_SIZE:
                return None

            normalized_path = normalize_path(str(file_path), repo_path)
            return {
                "file_path": normalized_path,
                "absolute_path": file_path,
                "file_type": get_file_type(str(file_path)),
                "sloc": _count_sloc_bytes(content),
                "_content": content,
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


def _count_sloc_bytes(content: bytes) -> int:
    try:
        text = content.decode("utf-8", errors="ignore")
    except Exception:
        return 0

    sloc = 0
    in_block = False

    for line in text.splitlines():
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
