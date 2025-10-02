from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration loaded from env and .env file."""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required
    GITLAB_BASE_URL: str # e.g. https://gitlab.example.com/api/v4
    GITLAB_TOKEN: str  # PAT with `api` scope

    # Optional
    GITLAB_PER_PAGE: int = 100
    REQUEST_TIMEOUT_S: float = 30.0
    CACHE_TTL_S: int = 60  # legacy default TTL (seconds)
    GROUP_TREE_CACHE_TTL_S: int = 60  # seconds
    PROJECTS_CACHE_TTL_S: int = 30  # seconds
    GROUP_TREE_SNAPSHOT_PATH: str = "./group_tree_snapshot.json"
    GROUP_TREE_WORKER_INLINE: bool = True
    GROUP_TREE_WORKER_INTERVAL_S: int = 60

    # Управление переписыванием абсолютных redirect'ов GitLab на относительные
    # при работе через base_url (см. services/gitlab.py)
    GITLAB_REWRITE_REDIRECTS: bool = True

    # Минимальный уровень доступа для проектов, чтобы показывать их в UI
    # 40 = Maintainer, 50 = Owner. По умолчанию фильтруем проекты, где у токена есть права Maintainer+
    GITLAB_MIN_ACCESS_LEVEL: int = 40

    # Логирование
    LOG_LEVEL: str = "INFO"  # DEBUG/INFO/WARNING/ERROR
    GITLAB_LOG_LEVEL: str = "WARNING"  # уровень логов HTTP-вызовов к GitLab


settings = Settings()
