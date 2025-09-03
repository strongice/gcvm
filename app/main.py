from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.services.gitlab import GitLabClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    http_client = httpx.AsyncClient(
        base_url=settings.GITLAB_BASE_URL,
        follow_redirects=False,
        trust_env=False,
    )
    app.state.http_client = http_client
    app.state.gitlab = GitLabClient(http_client)
    try:
        yield
    finally:
        await http_client.aclose()


app = FastAPI(title="GitLab File Variables WebUI", version="0.4.0", lifespan=lifespan)

# CORS не используется: фронтенд и бэкенд обслуживаются с одного origin

# Routers
from app.routers import groups as groups_router  # noqa: E402
from app.routers import projects as projects_router  # noqa: E402

app.include_router(groups_router.router)
app.include_router(projects_router.router)


# Meta
@app.get("/api/health", tags=["meta"])
async def api_health():
    u = await app.state.gitlab.get_user()
    return {
        "ok": True,
        "user": {"id": u.get("id"), "username": u.get("username"), "name": u.get("name")},
        "base_url": settings.GITLAB_BASE_URL,
    }


@app.get("/api/ui-config", tags=["meta"])
async def ui_config():
    return {
        "auto_refresh_enabled": settings.UI_AUTO_REFRESH_ENABLED,
        "auto_refresh_sec": settings.ui_auto_refresh_sec,
    }


# Static SPA (Vite build)
BASE_DIR = pathlib.Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="ui")
    ASSETS_DIR = FRONTEND_DIST / "assets"
    if ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="ui-assets")

    @app.get("/", include_in_schema=False)
    async def root_redirect():
        return RedirectResponse(url="/ui/")
