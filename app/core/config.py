from __future__ import annotations

import json
from typing import List, Optional
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

    # CORS как строка; парсим в список через свойство ниже
    CORS_ALLOW_ORIGINS: str = "*"

    # UI auto refresh (в секундах)
    UI_AUTO_REFRESH_ENABLED: bool = True
    UI_AUTO_REFRESH_SEC: int = 15

    # Legacy-поддержка старой переменной в миллисекундах (если задана — имеет приоритет)
    UI_AUTO_REFRESH_MS: Optional[int] = None

    @property
    def cors_allow_origins_list(self) -> List[str]:
        s = (self.CORS_ALLOW_ORIGINS or "*").strip()
        if s == "*":
            return ["*"]
        if s.startswith("["):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    return [str(x).strip() for x in arr if str(x).strip()]
            except Exception:
                pass
        return [part.strip() for part in s.split(",") if part.strip()]

    @property
    def ui_auto_refresh_sec(self) -> int:
        if self.UI_AUTO_REFRESH_MS is not None:
            # округлим вниз к сек; минимум 1 сек
            try:
                return max(1, int(self.UI_AUTO_REFRESH_MS / 1000))
            except Exception:
                return max(1, self.UI_AUTO_REFRESH_SEC)
        return max(1, self.UI_AUTO_REFRESH_SEC)

    @property
    def ui_auto_refresh_ms(self) -> int:
        # пригодится, если где-то нужно в мс
        return max(1000, int(self.ui_auto_refresh_sec * 1000))


settings = Settings()