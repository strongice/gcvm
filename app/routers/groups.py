from __future__ import annotations

from typing import Any, Dict, List, Optional
import logging

from datetime import timezone
from email.utils import parsedate_to_datetime

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/groups", tags=["groups"])
logger = logging.getLogger(__name__)

from app.metrics import GROUP_PAGE_REQUESTS


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
async def list_groups(request: Request, search: Optional[str] = Query(default=None)) -> JSONResponse:
    gl = request.app.state.gitlab
    since_header = request.headers.get("if-modified-since")
    known_hash = request.headers.get("x-tree-hash")
    since_ts: Optional[float] = None
    if since_header:
        try:
            dt = parsedate_to_datetime(since_header)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            since_ts = dt.timestamp()
        except Exception:
            since_ts = None

    result = await gl.list_groups(search=search, since_ts=since_ts, known_hash=known_hash)
    headers = _tree_headers(result)

    payload = dict(result)
    payload.pop("last_modified_http", None)
    return JSONResponse(content=payload, headers=headers)


def _tree_headers(payload: Dict[str, Any]) -> Dict[str, str]:
    headers: Dict[str, str] = {}
    last_modified_http = payload.get("last_modified_http")
    if last_modified_http:
        headers["Last-Modified"] = last_modified_http
    if payload.get("hash"):
        headers["X-Tree-Hash"] = payload["hash"]
    return headers


@router.get("/root")
async def list_root_groups_page(
    request: Request,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
) -> JSONResponse:
    gl = request.app.state.gitlab
    try:
        payload = await gl.list_groups_page(parent_id=None, cursor=cursor, limit=limit)
    except Exception:
        GROUP_PAGE_REQUESTS.labels(endpoint="root", result="error").inc()
        raise
    GROUP_PAGE_REQUESTS.labels(endpoint="root", result="ok").inc()
    headers = _tree_headers(payload)
    return JSONResponse(content=payload, headers=headers)


@router.get("/{group_id}/children")
async def list_group_children_page(
    request: Request,
    group_id: int,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
) -> JSONResponse:
    gl = request.app.state.gitlab
    try:
        payload = await gl.list_groups_page(parent_id=group_id, cursor=cursor, limit=limit)
    except Exception:
        GROUP_PAGE_REQUESTS.labels(endpoint="children", result="error").inc()
        raise
    GROUP_PAGE_REQUESTS.labels(endpoint="children", result="ok").inc()
    headers = _tree_headers(payload)
    return JSONResponse(content=payload, headers=headers)


@router.get("/{group_id}/path")
async def group_path(request: Request, group_id: int) -> List[Dict[str, Any]]:
    gl = request.app.state.gitlab
    return await gl.get_group_path(group_id)


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
