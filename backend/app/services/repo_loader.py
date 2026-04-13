import os
import stat
import shutil
from pathlib import Path
from typing import Optional
from git import Repo, GitCommandError
from app.config import REPOS_DIR, TEMP_DIR
from app.utils.paths import extract_repo_name_from_url


def _remove_readonly(func, path, _):
    """Обработчик для удаления read-only файлов на Windows (.git папки)."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


class RepositoryLoader:
    """Сервис для загрузки и клонирования репозиториев из GitHub."""

    def __init__(self):
        self.repos_dir = REPOS_DIR
        self.temp_dir = TEMP_DIR

    def clone_repository(self, repo_url: str, force: bool = False) -> Path:
        """
        Клонирует репозиторий из GitHub.

        Args:
            repo_url: URL репозитория (например, https://github.com/user/repo.git)
            force: Если True, перезаписывает существующий репозиторий

        Returns:
            Path к клонированному репозиторию

        Raises:
            Exception: Если клонирование не удалось
        """
        repo_name = extract_repo_name_from_url(repo_url)
        repo_path = self.repos_dir / repo_name

        if repo_path.exists():
            if force:
                shutil.rmtree(repo_path, onexc=_remove_readonly)
            else:
                try:
                    repo = Repo(repo_path)
                    repo.remotes.origin.pull()
                    return repo_path
                except Exception:
                    # Не удалось обновить — удаляем и клонируем заново
                    shutil.rmtree(repo_path, onexc=_remove_readonly)

        try:
            Repo.clone_from(repo_url, repo_path)
            return repo_path
        except GitCommandError as e:
            raise Exception(f"Не удалось клонировать репозиторий: {str(e)}")

    def get_repository_path(self, repo_url: str) -> Optional[Path]:
        """Возвращает путь к репозиторию, если он уже клонирован."""
        repo_name = extract_repo_name_from_url(repo_url)
        repo_path = self.repos_dir / repo_name
        return repo_path if repo_path.exists() else None

    def cleanup_repository(self, repo_url: str) -> bool:
        """Удаляет клонированный репозиторий."""
        repo_name = extract_repo_name_from_url(repo_url)
        repo_path = self.repos_dir / repo_name

        if repo_path.exists():
            shutil.rmtree(repo_path, onexc=_remove_readonly)
            return True
        return False