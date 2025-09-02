from __future__ import annotations

import pathlib
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.services.gitlab import GitLabClient
from app.routers import groups as groups_router
from app.routers import projects as projects_router
from app.routers import variables as variables_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    http_client = httpx.AsyncClient(base_url=settings.GITLAB_BASE_URL)
    app.state.http_client = http_client
    app.state.gitlab = GitLabClient(http_client)
    try:
        yield
    finally:
        await http_client.aclose()


app = FastAPI(title="GitLab File Variables WebUI", version="0.3.0", lifespan=lifespan)

# CORS
allow_origins = settings.cors_allow_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins if allow_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(groups_router.router)
app.include_router(projects_router.router)
app.include_router(variables_router.router)

# Health with token check
@app.get("/api/health", tags=["meta"])
async def api_health():
    r = await app.state.http_client.get("/user", headers={"PRIVATE-TOKEN": settings.GITLAB_TOKEN})
    if r.status_code >= 400:
        return {"ok": False, "status_code": r.status_code, "detail": r.text}
    u = r.json()
    return {"ok": True, "user": {"id": u.get("id"), "username": u.get("username"), "name": u.get("name")}}

# UI config for frontend
@app.get("/api/ui-config", tags=["meta"])
async def ui_config():
    return {
        "auto_refresh_enabled": settings.UI_AUTO_REFRESH_ENABLED,
        "auto_refresh_sec": settings.ui_auto_refresh_sec,
    }

# ---------- Static SPA (frontend/dist) ----------
BASE_DIR = pathlib.Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    # Раздаём всю сборку на /ui (SPA)
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="ui")
    # Vite по умолчанию ссылается на /assets/... — смонтируем ассеты и по корню
    ASSETS_DIR = FRONTEND_DIST / "assets"
    if ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="ui-assets")

    @app.get("/", include_in_schema=False)
    async def root_redirect():
        # Всегда ведём пользователя на /ui/
        return RedirectResponse(url="/ui/")
else:
    # Фолбэк: старый html (если фронтенд не собран)
    UI_DIR = BASE_DIR / "ui"

    @app.get("/", include_in_schema=False)
    async def index() -> HTMLResponse:
        html = (UI_DIR / "index.html").read_text(encoding="utf-8")
        return HTMLResponse(html)

