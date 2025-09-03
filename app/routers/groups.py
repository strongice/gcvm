from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/groups", tags=["groups"])
logger = logging.getLogger(__name__)


class UpsertVarPayload(BaseModel):
    key: str
    value: str
    variable_type: Optional[str] = None  # 'env_var' | 'file'
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
    data = payload.model_dump()
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
    logger.info("upsert group variable: group_id=%s %s", group_id, safe)
    try:
        res = await gl.group_file_var_upsert(group_id, data)
        logger.info("upsert group variable: done status=%s", res.get("status"))
        return res
    except Exception:
        logger.exception("upsert group variable: failed group_id=%s %s", group_id, safe)
        raise
