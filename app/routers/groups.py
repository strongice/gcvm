from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/groups", tags=["groups"])


class UpsertVarPayload(BaseModel):
    key: str
    value: str
    environment_scope: Optional[str] = "*"
    protected: bool = False
    masked: bool = False
    raw: bool = False
    masked_and_hidden: Optional[bool] = None

    original_key: Optional[str] = None
    original_environment_scope: Optional[str] = None


@router.get("")
async def list_groups(request: Request, search: Optional[str] = Query(default=None)) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.list_groups(search)


@router.get("/{group_id}/variables")
async def group_variables(request: Request, group_id: int) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.group_file_vars(group_id)


@router.get("/{group_id}/variables/{key}")
async def group_variable_get(
    request: Request,
    group_id: int,
    key: str,
    environment_scope: str = Query(default="*"),
) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    return await gl.group_file_var_get(group_id, key, environment_scope)


@router.post("/{group_id}/variables/upsert")
async def group_variable_upsert(request: Request, group_id: int, payload: UpsertVarPayload) -> Dict[str, Any]:
    gl = request.app.state.gitlab
    return await gl.group_file_var_upsert(group_id, payload.model_dump())

