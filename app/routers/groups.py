from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.deps import get_gitlab_client
from app.services.gitlab import GitLabClient
from app.schemas import UpsertVariableRequest

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("")
async def list_groups(search: Optional[str] = Query(None), gl: GitLabClient = Depends(get_gitlab_client)):
    return await gl.list_groups(search)


@router.get("/{group_id}/variables")
async def group_file_variables(group_id: int, gl: GitLabClient = Depends(get_gitlab_client)):
    return await gl.group_file_vars(group_id)


@router.get("/{group_id}/variables/{key}")
async def group_variable_get(
    group_id: int,
    key: str,
    environment_scope: str = Query("*"),
    gl: GitLabClient = Depends(get_gitlab_client),
):
    return await gl.group_file_var_get(group_id, key, environment_scope)


@router.post("/{group_id}/variables/upsert")
async def group_variable_upsert(
    group_id: int,
    body: UpsertVariableRequest,
    gl: GitLabClient = Depends(get_gitlab_client),
):
    return await gl.group_file_var_upsert(group_id, body.model_dump())
