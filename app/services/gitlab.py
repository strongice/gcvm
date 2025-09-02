from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException

from app.core.config import settings

HEADERS = {
    "PRIVATE-TOKEN": settings.GITLAB_TOKEN,
    "Content-Type": "application/json",
}


class GitLabClient:
    """Lightweight GitLab API wrapper (REST v4) focused on **file** variables."""

    def __init__(self, http: httpx.AsyncClient):
        self.http = http

    # ---------- low-level ----------
    @staticmethod
    def _raise_for_status(r: httpx.Response) -> None:
        if r.status_code >= 400:
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise HTTPException(status_code=r.status_code, detail=detail)

    async def _paginated_get(self, url: str, params: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        params = dict(params or {})
        params.setdefault("per_page", settings.GITLAB_PER_PAGE)
        page = 1
        acc: List[Dict[str, Any]] = []
        while True:
            p = dict(params)
            p["page"] = page
            r = await self.http.get(url, headers=HEADERS, params=p, timeout=settings.REQUEST_TIMEOUT_S)
            self._raise_for_status(r)
            chunk = r.json()
            if not isinstance(chunk, list):
                raise HTTPException(502, f"Unexpected response structure from {url}")
            acc.extend(chunk)
            next_page = r.headers.get("X-Next-Page")
            if not next_page or next_page == "0":
                break
            page = int(next_page)
        return acc

    # ---------- meta ----------
    async def get_user(self) -> Dict[str, Any]:
        r = await self.http.get("/user", headers=HEADERS, timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        return r.json()

    # ---------- groups ----------
    async def list_groups(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {
            "membership": True,
            "all_available": False,
            "include_subgroups": True,
            "top_level_only": False,
            "order_by": "path",
            "sort": "asc",
        }
        if search:
            params["search"] = search
        items = await self._paginated_get("/groups", params)
        return [
            {"id": g["id"], "name": g.get("name") or g.get("path"), "full_path": g.get("full_path")}
            for g in items
        ]

    # ---------- projects ----------
    async def list_projects(self, group_id: Optional[int] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        if group_id:
            params: Dict[str, Any] = {"with_shared": True, "order_by": "path", "sort": "asc"}
            if search:
                params["search"] = search
            items = await self._paginated_get(f"/groups/{group_id}/projects", params)
        else:
            params = {"membership": True, "simple": True, "order_by": "path", "sort": "asc"}
            if search:
                params["search"] = search
            items = await self._paginated_get("/projects", params)
        return [
            {
                "id": p["id"],
                "name": p.get("name") or p.get("path"),
                "path_with_namespace": p.get("path_with_namespace"),
                "namespace": (p.get("namespace", {}) or {}).get("full_path"),
            }
            for p in items
        ]

    # ---------- project variables (file) ----------
    async def project_file_vars(self, project_id: int) -> List[Dict[str, Any]]:
        items = await self._paginated_get(f"/projects/{project_id}/variables")
        out = [
            {
                "key": v["key"],
                "variable_type": v.get("variable_type"),
                "environment_scope": v.get("environment_scope", "*"),
                "protected": v.get("protected", False),
                "masked": v.get("masked", False),
                "raw": v.get("raw", False),
            }
            for v in items
            if v.get("variable_type") == "file"
        ]
        out.sort(key=lambda x: (x["key"], x.get("environment_scope") or "*"))
        return out

    async def project_file_var_get(self, project_id: int, key: str, env: str = "*") -> Dict[str, Any]:
        params = {"filter[environment_scope]": env}
        r = await self.http.get(
            f"/projects/{project_id}/variables/{key}",
            headers=HEADERS,
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        self._raise_for_status(r)
        v = r.json()
        if v.get("variable_type") != "file":
            raise HTTPException(404, "Variable exists but is not of type 'file'")
        return v

    # ---------- group variables (file) ----------
    async def group_file_vars(self, group_id: int) -> List[Dict[str, Any]]:
        items = await self._paginated_get(f"/groups/{group_id}/variables")
        out = [
            {
                "key": v["key"],
                "variable_type": v.get("variable_type"),
                "environment_scope": v.get("environment_scope", "*"),
                "protected": v.get("protected", False),
                "masked": v.get("masked", False),
                "raw": v.get("raw", False),
            }
            for v in items
            if v.get("variable_type") == "file"
        ]
        out.sort(key=lambda x: (x["key"], x.get("environment_scope") or "*"))
        return out

    async def group_file_var_get(self, group_id: int, key: str, env: str = "*") -> Dict[str, Any]:
        params = {"filter[environment_scope]": env}
        r = await self.http.get(
            f"/groups/{group_id}/variables/{key}",
            headers=HEADERS,
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        self._raise_for_status(r)
        v = r.json()
        if v.get("variable_type") != "file":
            raise HTTPException(404, "Variable exists but is not of type 'file'")
        return v

    # ---------- deletes (helpers) ----------
    async def _project_var_delete(self, project_id: int, key: str, env: str = "*") -> None:
        params = {"filter[environment_scope]": env}
        r = await self.http.delete(
            f"/projects/{project_id}/variables/{key}",
            headers=HEADERS,
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        # 204 OK или 404 (уже нет) — оба считаем успехом в сценарии переименования
        if r.status_code not in (204, 404):
            self._raise_for_status(r)

    async def _group_var_delete(self, group_id: int, key: str, env: str = "*") -> None:
        params = {"filter[environment_scope]": env}
        r = await self.http.delete(
            f"/groups/{group_id}/variables/{key}",
            headers=HEADERS,
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        if r.status_code not in (204, 404):
            self._raise_for_status(r)

    # ---------- upsert with rename (project) ----------
    async def project_file_var_upsert(self, project_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        new_key = payload["key"]
        new_env = payload.get("environment_scope", "*")
        body_common = {
            "value": payload["value"],
            "variable_type": "file",
            "protected": bool(payload.get("protected", False)),
            "masked": bool(payload.get("masked", False)),
            "raw": bool(payload.get("raw", False)),
            "environment_scope": new_env,
        }
        params_new = {"filter[environment_scope]": new_env}

        original_key = payload.get("original_key") or new_key
        original_env = payload.get("original_environment_scope") or new_env
        is_rename = (original_key != new_key) or (original_env != new_env)

        if is_rename:
            # 1) создаём новую
            body_create = dict(body_common, key=new_key)
            r_create = await self.http.post(
                f"/projects/{project_id}/variables",
                headers=HEADERS,
                content=json.dumps(body_create),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_create)
            # 2) удаляем старую
            await self._project_var_delete(project_id, original_key, original_env)
            return {
                "status": "renamed",
                "variable": r_create.json(),
                "deleted_old": {"key": original_key, "environment_scope": original_env},
            }

        # обычный upsert
        r_get = await self.http.get(
            f"/projects/{project_id}/variables/{new_key}",
            headers=HEADERS,
            params=params_new,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        if r_get.status_code == 200:
            r_put = await self.http.put(
                f"/projects/{project_id}/variables/{new_key}",
                headers=HEADERS,
                params=params_new,
                content=json.dumps(body_common),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_put)
            return {"status": "updated", "variable": r_put.json()}
        elif r_get.status_code == 404:
            body_create = dict(body_common, key=new_key)
            r_post = await self.http.post(
                f"/projects/{project_id}/variables",
                headers=HEADERS,
                content=json.dumps(body_create),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_post)
            return {"status": "created", "variable": r_post.json()}
        else:
            self._raise_for_status(r_get)
        raise HTTPException(500, "Unexpected flow")

    # ---------- upsert with rename (group) ----------
    async def group_file_var_upsert(self, group_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        new_key = payload["key"]
        new_env = payload.get("environment_scope", "*")
        body_common = {
            "value": payload["value"],
            "variable_type": "file",
            "protected": bool(payload.get("protected", False)),
            "masked": bool(payload.get("masked", False)),
            "raw": bool(payload.get("raw", False)),
            "environment_scope": new_env,
        }
        params_new = {"filter[environment_scope]": new_env}

        original_key = payload.get("original_key") or new_key
        original_env = payload.get("original_environment_scope") or new_env
        is_rename = (original_key != new_key) or (original_env != new_env)

        if is_rename:
            body_create = dict(body_common, key=new_key)
            r_create = await self.http.post(
                f"/groups/{group_id}/variables",
                headers=HEADERS,
                content=json.dumps(body_create),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_create)
            await self._group_var_delete(group_id, original_key, original_env)
            return {
                "status": "renamed",
                "variable": r_create.json(),
                "deleted_old": {"key": original_key, "environment_scope": original_env},
            }

        r_get = await self.http.get(
            f"/groups/{group_id}/variables/{new_key}",
            headers=HEADERS,
            params=params_new,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        if r_get.status_code == 200:
            r_put = await self.http.put(
                f"/groups/{group_id}/variables/{new_key}",
                headers=HEADERS,
                params=params_new,
                content=json.dumps(body_common),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_put)
            return {"status": "updated", "variable": r_put.json()}
        elif r_get.status_code == 404:
            body_create = dict(body_common, key=new_key)
            r_post = await self.http.post(
                f"/groups/{group_id}/variables",
                headers=HEADERS,
                content=json.dumps(body_create),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_post)
            return {"status": "created", "variable": r_post.json()}
        else:
            self._raise_for_status(r_get)
        raise HTTPException(500, "Unexpected flow")