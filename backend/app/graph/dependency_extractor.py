from pathlib import Path
from typing import Dict, List

from app.services.file_scanner import FileScanner
from app.services.parser import DependencyParser


class DependencyExtractor:
    """High-level wrapper around scanning + parsing to produce dependencies per file."""

    def __init__(self) -> None:
        self.scanner = FileScanner()
        self.parser = DependencyParser()

    def extract(self, repo_path: Path) -> tuple[List[Dict], Dict[str, List[Dict]]]:
        files = self.scanner.scan_repository(repo_path)
        deps = self.parser.parse_files(files, repo_path)
        return files, deps



