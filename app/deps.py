from __future__ import annotations

from fastapi import Depends, Request
from app.services.gitlab import GitLabClient


async def get_gitlab_client(request: Request) -> GitLabClient:
    # Reuse single client from app.state (created in lifespan)
    return request.app.state.gitlab
