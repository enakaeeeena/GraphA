import os
from pathlib import Path
from typing import List

# Базовые пути
BASE_DIR = Path(__file__).parent.parent
REPOS_DIR = BASE_DIR / "repositories"
TEMP_DIR = BASE_DIR / "temp"
DB_DIR = BASE_DIR / "data"
DB_PATH = DB_DIR / "app.db"

# Создаем директории если их нет
REPOS_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
DB_DIR.mkdir(exist_ok=True)

# Настройки анализа
SUPPORTED_EXTENSIONS: List[str] = [".js", ".ts", ".jsx", ".tsx"]
IGNORE_PATTERNS: List[str] = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
]

# Настройки парсера
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Настройки графа
GRAPH_LAYOUT = "force"  # или "hierarchical", "circular"

# Настройки API
API_PREFIX = "/api/v1"

# Настройки БД
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH.as_posix()}")

