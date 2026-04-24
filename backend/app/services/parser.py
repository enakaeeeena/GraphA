from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.utils.paths import resolve_import_path

# ── Tree-sitter импорты ────────────────────────────────────────────────────
try:
    import tree_sitter_javascript as tsjs
    import tree_sitter_typescript as tsts
    from tree_sitter import Language, Parser as TSParser, Query

    JS_LANGUAGE  = Language(tsjs.language())
    TSX_LANGUAGE = Language(tsts.language_tsx())
    TS_LANGUAGE  = Language(tsts.language_typescript())

    TREE_SITTER_AVAILABLE = True
    _TS_ERROR: str | None = None
except Exception as e:
    TREE_SITTER_AVAILABLE = False
    _TS_ERROR = f"{type(e).__name__}: {e}"


# ── Tree-sitter AST запросы ────────────────────────────────────────────────
_IMPORT_QUERY_SRC = """
(import_statement
  source: (string) @path)

(export_statement
  source: (string) @path)

(import_expression
  source: (string) @path)

(import_expression
  source: (template_string) @template_path)

(call_expression
  function: (identifier) @fn (#eq? @fn "require")
  arguments: (arguments (string) @path))

(call_expression
  function: (identifier) @fn (#eq? @fn "require")
  arguments: (arguments (template_string) @template_path))
"""

# Кэш Query объектов по языку
_QUERIES: dict = {}


def _get_query(language: "Language") -> "Query":
    if language not in _QUERIES:
        _QUERIES[language] = Query(language, _IMPORT_QUERY_SRC)
    return _QUERIES[language]


def _lang_for_ext(ext: str) -> Optional["Language"]:
    """Возвращает tree-sitter Language по расширению файла."""
    if not TREE_SITTER_AVAILABLE:
        return None
    return {
        ".js":  JS_LANGUAGE,
        ".jsx": JS_LANGUAGE,
        ".ts":  TS_LANGUAGE,
        ".tsx": TSX_LANGUAGE,
    }.get(ext.lower())


def _strip_quotes(text: str) -> str:
    """Убирает кавычки вокруг строкового литерала из AST-узла."""
    return text.strip("'\"`")


def _resolve_template_string(
    raw: str,
    file_path: Path,
    repo_base_path: Path,
) -> List[Dict]:
    """
    Эвристическая обработка шаблонных строк вида `./themes/${name}`.

    Алгоритм:
    1. Убираем backticks и вырезаем ${...} выражения
    2. Получаем статический префикс пути — например './themes/'
    3. Ищем все реальные файлы в этой директории которые подходят по расширению
    4. Каждый найденный файл добавляем как возможную зависимость

    Это эвристика — мы не знаем точно какой файл загрузится,
    но находим все кандидаты. Помечаем их import_type='dynamic_template'
    чтобы отличать от точных зависимостей.
    """
    import re

    # Убираем backticks
    inner = raw.strip("`")

    # Вырезаем ${...} — оставляем только статические части
    static_parts = re.sub(r'\$\{[^}]*\}', '*', inner)

    # Берём только префикс до первой звёздочки
    prefix = static_parts.split('*')[0]

    if not prefix or not (prefix.startswith('./') or prefix.startswith('../') or prefix.startswith('/')):
        return []

    # Резолвим директорию по префиксу
    base_dir = file_path.parent
    try:
        if prefix.endswith('/'):
            target_dir = (base_dir / prefix).resolve()
        else:
            target_dir = (base_dir / Path(prefix).parent).resolve()
    except Exception:
        return []

    if not target_dir.exists() or not target_dir.is_dir():
        return []

    # Ищем все JS/TS файлы в директории (не рекурсивно)
    supported = {'.js', '.jsx', '.ts', '.tsx'}
    results = []
    try:
        for candidate in target_dir.iterdir():
            if candidate.suffix.lower() in supported and candidate.is_file():
                results.append({
                    "import_path":   raw.strip("`"),   # оригинальный шаблон
                    "import_type":   "dynamic_template",
                    "resolved_path": candidate,
                })
    except Exception:
        pass

    return results


# ── Основной класс ─────────────────────────────────────────────────────────

class DependencyParser:
    """
    Парсер зависимостей на основе AST (tree-sitter).

    Для каждого JS/TS файла строится абстрактное синтаксическое дерево,
    из которого через S-expression запросы извлекаются все конструкции импорта:
      - ES6 import / export from
      - dynamic import()
      - CommonJS require()

    Преимущество перед regex: AST-парсер понимает структуру кода и не
    находит импорты внутри комментариев или строковых литералов.

    Если tree-sitter не установлен — автоматически переключается на
    резервный regex-парсинг с предупреждением.
    """

    def __init__(self) -> None:
        if not TREE_SITTER_AVAILABLE:
            import warnings
            warnings.warn(
                f"tree-sitter не установлен или не работает ({_TS_ERROR}) — "
                "используется резервный regex-парсинг.\n"
                "Установите в venv: pip install tree-sitter tree-sitter-javascript tree-sitter-typescript",
                RuntimeWarning,
                stacklevel=2,
            )

    # ── Публичный API ──────────────────────────────────────────────────────

    def parse_file(self, file_path: Path, repo_base_path: Path) -> List[Dict]:
        """
        Парсит один файл и возвращает список зависимостей.

        Каждая зависимость — словарь:
        {
            "import_path":   str,           # исходная строка из кода, напр. './Button'
            "import_type":   str,           # "relative" | "absolute" | "node_modules"
            "resolved_path": Path | None,   # абсолютный путь на диске если разрешён
        }
        """
        try:
            content = file_path.read_bytes()
        except Exception:
            return []

        ext = file_path.suffix.lower()
        language = _lang_for_ext(ext)

        if language:
            try:
                return self._parse_ast(content, file_path, repo_base_path, language)
            except Exception:
                # Если AST-парсинг упал — fallback на regex
                pass

        return self._parse_regex(
            content.decode("utf-8", errors="ignore"),
            file_path,
            repo_base_path,
        )

    def parse_files(
        self,
        files: List[Dict],
        repo_base_path: Path,
    ) -> Dict[str, List[Dict]]:
        """Параллельно парсит список файлов через ThreadPoolExecutor."""
        repo_base_path = Path(repo_base_path).resolve()
        result: Dict[str, List[Dict]] = {}
        max_workers = min(8, len(files) or 1)

        def _parse_one(file_info: Dict):
            deps = self.parse_file(
                Path(file_info["absolute_path"]),
                repo_base_path,
            )
            return file_info["file_path"], deps

        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(_parse_one, f): f for f in files}
            for future in as_completed(futures):
                try:
                    path, deps = future.result()
                    result[path] = deps
                except Exception:
                    result[futures[future]["file_path"]] = []

        return result

    # ── AST-парсинг (tree-sitter) ──────────────────────────────────────────

    def _parse_ast(
        self,
        content: bytes,
        file_path: Path,
        repo_base_path: Path,
        language: "Language",
    ) -> List[Dict]:
        """
        Строит AST и обходит его через Query.

        Новый API tree-sitter (>= 0.24):
        - Query(language, pattern) вместо language.query(pattern)
        - query.matches(node) вместо query.captures(node)
        - matches возвращает список (pattern_index, {capture_name: [nodes]})
        """
        parser = TSParser(language)
        tree = parser.parse(content)
        query = _get_query(language)

        # matches() возвращает список кортежей (pattern_idx, captures_dict)
        # captures_dict = {"path": [node, ...], "template_path": [node, ...]}
        matches = query.matches(tree.root_node)

        found: set[str] = set()
        dependencies: List[Dict] = []

        for _pattern_idx, captures_dict in matches:
            # ── Точные строковые импорты ───────────────────────────────
            for node in captures_dict.get("path", []):
                raw = node.text.decode("utf-8", errors="ignore")
                import_path = _strip_quotes(raw)
                if not import_path or import_path in found:
                    continue
                found.add(import_path)

                import_type = self._classify_import(import_path)
                resolved_path: Optional[Path] = None
                if import_type != "node_modules":
                    resolved_path = resolve_import_path(
                        import_path, file_path, repo_base_path
                    )
                dependencies.append({
                    "import_path":   import_path,
                    "import_type":   import_type,
                    "resolved_path": resolved_path,
                })

            # ── Шаблонные строки — эвристика ──────────────────────────
            for node in captures_dict.get("template_path", []):
                raw = node.text.decode("utf-8", errors="ignore")
                if raw in found:
                    continue
                found.add(raw)
                candidates = _resolve_template_string(raw, file_path, repo_base_path)
                dependencies.extend(candidates)

        return dependencies

    # ── Резервный regex-парсинг ────────────────────────────────────────────

    def _parse_regex(
        self,
        content: str,
        file_path: Path,
        repo_base_path: Path,
    ) -> List[Dict]:
        """
        Резервный парсинг через регулярные выражения.
        Используется если tree-sitter не установлен.
        """
        import re

        patterns = [
            r"import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]",
            r"require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",
            r"import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",
            r"export\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['\"]([^'\"]+)['\"]",
        ]

        found: set[str] = set()
        dependencies: List[Dict] = []

        for pattern in patterns:
            for match in re.finditer(pattern, content, re.MULTILINE):
                import_path = match.group(1) if match.groups() else match.group(0)
                if not import_path or import_path in found:
                    continue
                found.add(import_path)

                import_type = self._classify_import(import_path)
                resolved_path = None
                if import_type != "node_modules":
                    resolved_path = resolve_import_path(
                        import_path, file_path, repo_base_path
                    )

                dependencies.append({
                    "import_path":   import_path,
                    "import_type":   import_type,
                    "resolved_path": resolved_path,
                })

        return dependencies

    # ── Вспомогательные ───────────────────────────────────────────────────

    @staticmethod
    def _classify_import(import_path: str) -> str:
        if import_path.startswith("."):
            return "relative"
        if import_path.startswith("/"):
            return "absolute"
        return "node_modules"