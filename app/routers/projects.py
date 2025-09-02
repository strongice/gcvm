from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.deps import get_gitlab_client
from app.services.gitlab import GitLabClient
from app.schemas import UpsertVariableRequest

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
async def list_projects(
    group_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    gl: GitLabClient = Depends(get_gitlab_client),
):
    return await gl.list_projects(group_id, search)


@router.get("/{project_id}/variables")
async def project_file_variables(project_id: int, gl: GitLabClient = Depends(get_gitlab_client)):
    return await gl.project_file_vars(project_id)


@router.get("/{project_id}/variables/{key}")
async def project_variable_get(
    project_id: int,
    key: str,
    environment_scope: str = Query("*"),
    gl: GitLabClient = Depends(get_gitlab_client),
):
    return await gl.project_file_var_get(project_id, key, environment_scope)


@router.post("/{project_id}/variables/upsert")
async def project_variable_upsert(
    project_id: int,
    body: UpsertVariableRequest,
    gl: GitLabClient = Depends(get_gitlab_client),
):
    return await gl.project_file_var_upsert(project_id, body.model_dump())
