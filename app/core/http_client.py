from __future__ import annotations

import httpx

from app.core.config import settings


def create_gitlab_http_client() -> httpx.AsyncClient:
    """Create a preconfigured HTTP client for GitLab requests."""

    limits = httpx.Limits(
        max_connections=20,
        max_keepalive_connections=10,
        keepalive_expiry=60.0,
    )
    return httpx.AsyncClient(
        base_url=settings.GITLAB_BASE_URL,
        follow_redirects=False,
        trust_env=False,
        http2=True,
        limits=limits,
    )

