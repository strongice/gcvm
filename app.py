#!/usr/bin/env python3
"""
Entrypoint to run the GitLab File Vars WebUI with `python app.py`.
Reads `.env` from project root and supports HOST/PORT/RELOAD/WORKERS/LOG_LEVEL overrides.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
import uvicorn

# Импортируем объект приложения — пригодится, когда reload выключен
from app.main import app as fastapi_app  # требуется, чтобы app/ был пакетом


def main() -> None:
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8080"))
    reload_enabled = os.getenv("RELOAD", "true").lower() in ("1", "true", "yes", "on")
    # uvicorn ожидает нижний регистр: debug/info/warning/error/critical/trace
    log_level = (os.getenv("LOG_LEVEL", "info") or "info").lower()
    workers = int(os.getenv("WORKERS", "1") or "1")

    # При reload uvicorn работает только с import string и всего с 1 воркером
    if reload_enabled:
        workers = 1
        target = "app.main:app"   # <— строка импорта обязательна для reload/workers
        reload_dirs = [str(Path(__file__).parent / "app")]
    elif workers > 1:
        target = "app.main:app"   # при >1 воркера тоже нужна строка импорта
        reload_dirs = None
    else:
        target = fastapi_app      # когда один процесс и без reload — можно передать объект
        reload_dirs = None

    uvicorn.run(
        target,
        host=host,
        port=port,
        reload=reload_enabled,
        log_level=log_level,
        workers=workers,
        reload_dirs=reload_dirs,
    )


if __name__ == "__main__":
    main()
