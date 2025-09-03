from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/projects", tags=["projects"])


class UpsertVarPayload(BaseModel):
    key: str
    value: str
    environment_scope: Optional[str] = "*"
    protected: bool = False
    masked: bool = False
    raw: bool = False
    # GitLab 17.4+: создание скрытой переменной
    masked_and_hidden: Optional[bool] = None

    # для переименования/смены scope
    original_key: Optional[str] = None
    original_environment_scope: Optional[str] = None


@router.get("")
async def list_projects(
    request: Request,
    group_id: Optional[int] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.list_projects(group_id=group_id, search=search)


@router.get("/{project_id}/variables")
async def project_variables(request: Request, project_id: int) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.project_file_vars(project_id)


@router.get("/{project_id}/variables/{key}")
async def project_variable_get(
    request: Request,
    project_id: int,
    key: str,
    environment_scope: str = Query(default="*"),
) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    return await gl.project_file_var_get(project_id, key, environment_scope)


@router.get("/{project_id}/environments")
async def project_envs(request: Request, project_id: int) -> Dict[str, List[str]]:
    gl = request.app.state.gitlab
    names = await gl.list_project_environments(project_id)
    return {"environments": names}


@router.post("/{project_id}/variables/upsert")
async def project_variable_upsert(request: Request, project_id: int, payload: UpsertVarPayload) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    return await gl.project_file_var_upsert(project_id, payload.model_dump())
