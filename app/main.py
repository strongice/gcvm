from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager
import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import settings
from app.services.gitlab import GitLabClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    limits = httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=60.0)
    http_client = httpx.AsyncClient(
        base_url=settings.GITLAB_BASE_URL,
        follow_redirects=False,
        trust_env=False,
        http2=True,
        limits=limits,
    )
    app.state.http_client = http_client
    app.state.gitlab = GitLabClient(http_client)
    try:
        # warm caches in background (non-blocking)
        import asyncio
        async def _warm():
            gl = app.state.gitlab
            try:
                await gl.count_groups()
            except Exception:
                pass
            try:
                await gl.count_projects()
            except Exception:
                pass
            try:
                await gl.sample_projects(limit=6)
            except Exception:
                pass
            # Optional warm caches for lists (bounded to reduce load)
            try:
                await gl.list_groups()
            except Exception:
                pass
            try:
                # Preload up to 200 membership projects (first pages)
                await gl.list_projects(group_id=None, search=None, limit=200)
            except Exception:
                pass
        asyncio.create_task(_warm())
        yield
    finally:
        await http_client.aclose()


app = FastAPI(title="GitLab File Variables WebUI", version="0.5.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS не используется: фронтенд и бэкенд обслуживаются с одного origin

# Логирование
root_level = getattr(logging, (settings.LOG_LEVEL or "INFO").upper(), logging.INFO)
logging.basicConfig(
    level=root_level,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
gitlab_level = getattr(logging, (settings.GITLAB_LOG_LEVEL or "WARNING").upper(), logging.WARNING)
logging.getLogger("app.services.gitlab").setLevel(gitlab_level)

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


@app.get("/api/stats", tags=["meta"])
async def api_stats():
    gl = app.state.gitlab
    from asyncio import gather
    groups_count_f = gl.count_groups()
    projects_count_f = gl.count_projects()
    projects_sample_f = gl.sample_projects(limit=6)
    groups_count, projects_count, projects_sample = await gather(groups_count_f, projects_count_f, projects_sample_f)
    return {
        "groups_count": groups_count,
        "projects_count": projects_count,
        "projects_sample": projects_sample,
    }


# Static frontend (Vite build, MPA)
BASE_DIR = pathlib.Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # Cache policy middleware for frontend assets and pages
    @app.middleware("http")
    async def _cache_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        try:
            if path.startswith("/assets/"):
                # Long cache for fingerprinted assets
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif path == "/" or path.startswith("/group/") or path.startswith("/project/"):
                # HTML pages should always revalidate to pick up new asset hashes
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
        except Exception:
            pass
        return response

    # Root page
    @app.get("/", include_in_schema=False)
    async def root_index():
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    # MPA pages
    @app.get("/group/{group_id}", include_in_schema=False)
    async def ui_group_page(group_id: int):
        path = FRONTEND_DIST / "group.html"
        if path.exists():
            return FileResponse(str(path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    @app.get("/group/{group_id}/", include_in_schema=False)
    async def ui_group_page_slash(group_id: int):
        return await ui_group_page(group_id)

    @app.get("/project/{project_id}", include_in_schema=False)
    async def ui_project_page(project_id: int):
        path = FRONTEND_DIST / "project.html"
        if path.exists():
            return FileResponse(str(path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    @app.get("/project/{project_id}/", include_in_schema=False)
    async def ui_project_page_slash(project_id: int):
        return await ui_project_page(project_id)

    # Static assets
    ASSETS_DIR = FRONTEND_DIST / "assets"
    if ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="ui-assets")
