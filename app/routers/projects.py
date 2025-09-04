from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/projects", tags=["projects"])
logger = logging.getLogger(__name__)


class UpsertVarPayload(BaseModel):
    key: str
    value: str
    variable_type: Optional[str] = None  # 'env_var' | 'file'
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
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.list_projects(group_id=group_id, search=search, limit=limit)


@router.get("/{project_id}")
async def project_get(request: Request, project_id: int) -> Dict[str, Any]:
    """Эндпоинт для восстановления контекста проекта на фронтенде.

    Логируем обращение и отдадим минимальный набор полей, которых достаточно UI.
    """
    gl = request.app.state.gitlab
    logger.info("project_get: requested project_id=%s", project_id)
    try:
        data = await gl.get_project(project_id)
        logger.debug("project_get: resolved project_id=%s -> %s", project_id, data)
        return data
    except Exception as e:
        logger.warning("project_get: failed for project_id=%s: %s", project_id, e)
        raise


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


@router.get("/{project_id}/bundle")
async def project_bundle(request: Request, project_id: int) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    data = await gl.project_bundle(project_id)
    return data


@router.post("/{project_id}/variables/upsert")
async def project_variable_upsert(request: Request, project_id: int, payload: UpsertVarPayload) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    data = payload.model_dump()
    # Безопасный лог (без value)
    safe = {
        "key": data.get("key"),
        "value_len": (len(data.get("value") or "")),
        "variable_type": data.get("variable_type"),
        "environment_scope": data.get("environment_scope"),
        "protected": data.get("protected"),
        "masked": data.get("masked"),
        "masked_and_hidden": data.get("masked_and_hidden"),
        "raw": data.get("raw"),
        "original_key": data.get("original_key"),
        "original_environment_scope": data.get("original_environment_scope"),
    }
    logger.info("upsert project variable: project_id=%s %s", project_id, safe)
    try:
        res = await gl.project_file_var_upsert(project_id, data)
        logger.info("upsert project variable: done status=%s", res.get("status"))
        return res
    except Exception as e:
        logger.exception("upsert project variable: failed project_id=%s %s", project_id, safe)
        raise
