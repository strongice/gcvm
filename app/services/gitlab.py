from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
import logging
import time

from app.core.config import settings

HEADERS = {
    "PRIVATE-TOKEN": settings.GITLAB_TOKEN,
    "Content-Type": "application/json",
}


logger = logging.getLogger(__name__)


class GitLabClient:
    """Minimal GitLab REST v4 client for file variables (projects & groups)."""

    def __init__(self, http: httpx.AsyncClient):
        self.http = http  # base_url=settings.GITLAB_BASE_URL
        self._cache: Dict[Tuple[Any, ...], Tuple[float, Any]] = {}
        try:
            self._cache_ttl = max(0, int(settings.CACHE_TTL_S))
        except Exception:
            self._cache_ttl = 0

    # ---------- cache helpers ----------
    def _cache_get(self, key: Tuple[Any, ...]) -> Optional[Any]:
        if self._cache_ttl <= 0:
            return None
        rec = self._cache.get(key)
        if not rec:
            return None
        expires_at, value = rec
        if expires_at >= time.time():
            return value
        self._cache.pop(key, None)
        return None

    def _cache_set(self, key: Tuple[Any, ...], value: Any) -> None:
        if self._cache_ttl <= 0:
            return
        self._cache[key] = (time.time() + self._cache_ttl, value)

    # ---------- low-level ----------
    @staticmethod
    def _raise_for_status(r: httpx.Response) -> None:
        if r.status_code >= 400:
            try:
                detail = r.json()
            except Exception:
                detail = r.text
            raise HTTPException(status_code=r.status_code, detail=detail)

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("HTTP %s %s", method, url)
        try:
            r = await self.http.request(method, url, headers=HEADERS, **kwargs)
        except httpx.ReadTimeout as e:
            logger.warning("HTTP %s %s -> timeout", method, url)
            raise HTTPException(504, "GitLab API timed out") from e
        # Нормализуем redirect на абсолютный external_url (типа http://localhost)
        if 300 <= r.status_code < 400:
            loc = r.headers.get("location")
            if not loc:
                return r
            parsed = urlparse(loc)
            # Переписываем в относительный, чтобы использовался base_url клиента
            if parsed.scheme and parsed.netloc and settings.GITLAB_REWRITE_REDIRECTS:
                rel = parsed.path or "/"
                if parsed.query:
                    rel = f"{rel}?{parsed.query}"
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug("HTTP redirect -> %s", rel)
                r = await self.http.request(method, rel, headers=HEADERS, **kwargs)
                return r
            if not parsed.netloc:
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug("HTTP redirect -> %s", loc)
                r = await self.http.request(method, loc, headers=HEADERS, **kwargs)
                return r
        if r.status_code >= 400:
            try:
                body = r.text
            except Exception:
                body = "<no body>"
            logger.warning("HTTP %s %s -> %s; body: %s", method, url, r.status_code, body[:1000])
        else:
            logger.debug("HTTP %s %s -> %s", method, url, r.status_code)
        return r

    async def _paginated_get(self, url: str, params: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        params = dict(params or {})
        # Ограничим размер страницы разумным пределом, чтобы не получать гигантские ответы
        per_page_cfg = int(params.get("per_page", settings.GITLAB_PER_PAGE)) if params.get("per_page") else settings.GITLAB_PER_PAGE
        params["per_page"] = max(1, min(int(per_page_cfg or 100), 200))
        page = 1
        acc: List[Dict[str, Any]] = []
        while True:
            p = dict(params)
            p["page"] = page
            r = await self._request("GET", url, params=p, timeout=settings.REQUEST_TIMEOUT_S)
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

    # lightweight counts without fetching all pages
    async def _count(self, url: str, params: Dict[str, Any]) -> int:
        p = dict(params)
        p["per_page"] = 1
        p["page"] = 1
        r = await self._request("GET", url, params=p, timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        total = r.headers.get("X-Total") or r.headers.get("X-Total-Pages")
        try:
            return int(total) if total is not None else max(0, len(r.json()) if isinstance(r.json(), list) else 0)
        except Exception:
            return max(0, len(r.json()) if isinstance(r.json(), list) else 0)

    # ---------- meta ----------
    async def get_user(self) -> Dict[str, Any]:
        r = await self._request("GET", "/user", timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        return r.json()

    # ---------- groups ----------
    async def list_groups(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        ck = ("list_groups", search or "")
        cached = self._cache_get(ck)
        if cached is not None:
            return cached
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
            "order_by": "path",
            "sort": "asc",
        }
        if search:
            params["search"] = search
        items = await self._paginated_get("/groups", params)
        out = [
            {"id": g["id"], "name": g.get("name") or g.get("path"), "full_path": g.get("full_path")}
            for g in items
        ]
        self._cache_set(ck, out)
        return out

    async def count_groups(self) -> int:
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
        }
        return await self._count("/groups", params)

    # list_top_groups / list_subgroups — удалены (откат варианта A)

    # ---------- projects (все доступные токену) ----------
    async def list_projects(self, group_id: Optional[int] = None, search: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Возвращает все проекты, доступные токену (без фильтрации по ролям).
        """
        ck = ("list_projects", group_id or 0, search or "", int(limit or 0))
        cached = self._cache_get(ck)
        if cached is not None:
            return cached

        per_page = max(1, min(int(settings.GITLAB_PER_PAGE or 100), 200))
        collected: List[Dict[str, Any]] = []

        if group_id:
            params: Dict[str, Any] = {
                "with_shared": True,
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            # Manual pagination with early stop
            page = 1
            while True:
                p = dict(params, per_page=per_page, page=page)
                r = await self._request("GET", f"/groups/{group_id}/projects", params=p, timeout=settings.REQUEST_TIMEOUT_S)
                self._raise_for_status(r)
                chunk = r.json()
                if not isinstance(chunk, list):
                    raise HTTPException(502, "Unexpected response structure for projects")
                collected.extend(chunk)
                if limit and len(collected) >= limit:
                    break
                next_page = r.headers.get("X-Next-Page")
                if not next_page or next_page == "0":
                    break
                page = int(next_page)
        else:
            params = {
                "membership": True,
                "simple": True,  # лёгкий payload для UI
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            page = 1
            while True:
                p = dict(params, per_page=per_page, page=page)
                r = await self._request("GET", "/projects", params=p, timeout=settings.REQUEST_TIMEOUT_S)
                self._raise_for_status(r)
                chunk = r.json()
                if not isinstance(chunk, list):
                    raise HTTPException(502, "Unexpected response structure for projects")
                collected.extend(chunk)
                if limit and len(collected) >= limit:
                    break
                next_page = r.headers.get("X-Next-Page")
                if not next_page or next_page == "0":
                    break
                page = int(next_page)

        out: List[Dict[str, Any]] = []
        for p in collected[: (limit or len(collected))]:
            ns = (p.get("namespace", {}) or {})
            out.append(
                {
                    "id": p["id"],
                    "name": p.get("name") or p.get("path"),
                    "path_with_namespace": p.get("path_with_namespace"),
                    "namespace_id": ns.get("id"),
                    "namespace_full_path": ns.get("full_path"),
                }
            )
        self._cache_set(ck, out)
        return out

    async def count_projects(self, group_id: Optional[int] = None, search: Optional[str] = None) -> int:
        if group_id:
            params: Dict[str, Any] = {
                "with_shared": True,
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            return await self._count(f"/groups/{group_id}/projects", params)
        else:
            params = {
                "membership": True,
                "simple": True,
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            return await self._count("/projects", params)

    async def sample_projects(self, limit: int = 6) -> List[Dict[str, Any]]:
        params = {
            "membership": True,
            "simple": True,
            "order_by": "path",
            "sort": "asc",
            "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            "per_page": max(1, min(int(limit or 6), 50)),
            "page": 1,
        }
        r = await self._request("GET", "/projects", params=params, timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        items = r.json() or []
        out: List[Dict[str, Any]] = []
        for p in items:
            ns = (p.get("namespace", {}) or {})
            out.append(
                {
                    "id": p["id"],
                    "name": p.get("name") or p.get("path"),
                    "path_with_namespace": p.get("path_with_namespace"),
                    "namespace_id": ns.get("id"),
                    "namespace_full_path": ns.get("full_path"),
                }
            )
        return out

    async def get_project(self, project_id: int) -> Dict[str, Any]:
        """Возвращает минимальные данные проекта, используемые UI при восстановлении контекста."""
        r = await self._request("GET", f"/projects/{project_id}")
        self._raise_for_status(r)
        p = r.json()
        ns = (p.get("namespace", {}) or {})
        return {
            "id": p.get("id"),
            "name": p.get("name") or p.get("path"),
            "path_with_namespace": p.get("path_with_namespace"),
            "namespace_id": ns.get("id"),
            "namespace_full_path": ns.get("full_path"),
        }

    # ---------- environments ----------
    async def list_project_environments(self, project_id: int) -> List[str]:
        ck = ("list_envs", project_id)
        cached = self._cache_get(ck)
        if cached is not None:
            return cached
        r = await self._request("GET", f"/projects/{project_id}/environments", params={"states": "available"})
        if r.status_code in (400, 422):
            r = await self._request("GET", f"/projects/{project_id}/environments")
        self._raise_for_status(r)
        items = r.json()
        names = [it.get("name") for it in items if isinstance(it, dict) and it.get("name")]
        out = sorted({n for n in names}, key=lambda s: s.lower())
        self._cache_set(ck, out)
        return out

    async def project_bundle(self, project_id: int) -> Dict[str, Any]:
        from asyncio import gather
        proj_fut = self.get_project(project_id)
        vars_fut = self.project_file_vars(project_id)
        envs_fut = self.list_project_environments(project_id)
        proj, vars_list, envs = await gather(proj_fut, vars_fut, envs_fut)
        return {"project": proj, "variables": vars_list, "environments": envs}

    # ---------- project variables (all types) ----------
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
                "hidden": v.get("hidden", False),  # GitLab 17.4+
            }
            for v in items
            if isinstance(v, dict)
        ]
        out.sort(key=lambda x: (x["key"], x.get("environment_scope") or "*"))
        return out

    async def project_file_var_get(self, project_id: int, key: str, env: str = "*") -> Dict[str, Any]:
        params = {"filter[environment_scope]": env}
        r = await self._request(
            "GET",
            f"/projects/{project_id}/variables/{key}",
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        self._raise_for_status(r)
        return r.json()

    # ---------- group variables (all types) ----------
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
                "hidden": v.get("hidden", False),  # GitLab 17.4+
            }
            for v in items
            if isinstance(v, dict)
        ]
        out.sort(key=lambda x: (x["key"], x.get("environment_scope") or "*"))
        return out

    async def group_file_var_get(self, group_id: int, key: str, env: str = "*") -> Dict[str, Any]:
        params = {"filter[environment_scope]": env}
        r = await self._request(
            "GET",
            f"/groups/{group_id}/variables/{key}",
            params=params,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        self._raise_for_status(r)
        return r.json()

    # ---------- deletes ----------
    async def _project_var_delete(self, project_id: int, key: str, env: str = "*") -> None:
        params = {"filter[environment_scope]": env}
        r = await self._request("DELETE", f"/projects/{project_id}/variables/{key}", params=params)
        if r.status_code not in (204, 404):
            self._raise_for_status(r)

    async def _group_var_delete(self, group_id: int, key: str, env: str = "*") -> None:
        params = {"filter[environment_scope]": env}
        r = await self._request("DELETE", f"/groups/{group_id}/variables/{key}", params=params)
        if r.status_code not in (204, 404):
            self._raise_for_status(r)

    # ---------- upsert with rename (project) ----------
    async def project_file_var_upsert(self, project_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        new_key = payload["key"]
        new_env = payload.get("environment_scope", "*")

        # GitLab 17.4: создание hidden — через masked_and_hidden=true
        mah = bool(payload.get("masked_and_hidden", False))
        masked = bool(payload.get("masked", False) or mah)
        variable_type = payload.get("variable_type") or "file"

        body_common = {
            "value": payload["value"],
            "variable_type": variable_type,
            "protected": bool(payload.get("protected", False)),
            "masked": masked,  # на PUT используем masked; для скрытой создадим заново
            "raw": bool(payload.get("raw", False)),
            "environment_scope": new_env,
        }
        if masked:
            try:
                vlen = len(payload.get("value") or "")
                logger.info("upsert project masked value: key=%s type=%s len=%s", new_key, variable_type, vlen)
            except Exception:
                pass
        params_new = {"filter[environment_scope]": new_env}

        original_key = payload.get("original_key") or new_key
        original_env = payload.get("original_environment_scope") or new_env
        is_rename = (original_key != new_key) or (original_env != new_env)

        if is_rename:
            # создаём новую (если надо — скрытую), затем удаляем старую
            create_body = dict(body_common, key=new_key)
            if mah:
                create_body["masked_and_hidden"] = True
            r_create = await self._request(
                "POST",
                f"/projects/{project_id}/variables",
                content=json.dumps(create_body),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_create)
            await self._project_var_delete(project_id, original_key, original_env)
            return {
                "status": "renamed",
                "variable": r_create.json(),
                "deleted_old": {"key": original_key, "environment_scope": original_env},
            }

        # не переименовываем — проверим, существует ли
        r_get = await self._request(
            "GET",
            f"/projects/{project_id}/variables/{new_key}",
            params=params_new,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        if r_get.status_code == 200:
            if mah:
                # повыcить до hidden нельзя PUT'ом — пересоздаём
                await self._project_var_delete(project_id, new_key, new_env)
                create_body = dict(body_common, key=new_key, masked=True)
                create_body["masked_and_hidden"] = True
                r_create = await self._request(
                    "POST",
                    f"/projects/{project_id}/variables",
                    content=json.dumps(create_body),
                    timeout=settings.REQUEST_TIMEOUT_S,
                )
                self._raise_for_status(r_create)
                return {
                    "status": "renamed",
                    "variable": r_create.json(),
                    "deleted_old": {"key": new_key, "environment_scope": new_env},
                }

            # обычный апдейт
            r_put = await self._request(
                "PUT",
                f"/projects/{project_id}/variables/{new_key}",
                params=params_new,
                content=json.dumps(body_common),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_put)
            return {"status": "updated", "variable": r_put.json()}

        if r_get.status_code == 404:
            # создаём новую
            create_body = dict(body_common, key=new_key)
            if mah:
                create_body["masked_and_hidden"] = True
            r_post = await self._request(
                "POST",
                f"/projects/{project_id}/variables",
                content=json.dumps(create_body),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_post)
            return {"status": "created", "variable": r_post.json()}

        self._raise_for_status(r_get)
        raise HTTPException(500, "Unexpected flow")

    # ---------- upsert with rename (group) ----------
    async def group_file_var_upsert(self, group_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        new_key = payload["key"]
        new_env = payload.get("environment_scope", "*")

        mah = bool(payload.get("masked_and_hidden", False))
        masked = bool(payload.get("masked", False) or mah)
        variable_type = payload.get("variable_type") or "file"

        body_common = {
            "value": payload["value"],
            "variable_type": variable_type,
            "protected": bool(payload.get("protected", False)),
            "masked": masked,
            "raw": bool(payload.get("raw", False)),
            "environment_scope": new_env,
        }
        if masked:
            try:
                vlen = len(payload.get("value") or "")
                logger.info("upsert group masked value: key=%s type=%s len=%s", new_key, variable_type, vlen)
            except Exception:
                pass
        params_new = {"filter[environment_scope]": new_env}

        original_key = payload.get("original_key") or new_key
        original_env = payload.get("original_environment_scope") or new_env
        is_rename = (original_key != new_key) or (original_env != new_env)

        if is_rename:
            create_body = dict(body_common, key=new_key)
            if mah:
                create_body["masked_and_hidden"] = True
            r_create = await self._request(
                "POST",
                f"/groups/{group_id}/variables",
                content=json.dumps(create_body),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_create)
            await self._group_var_delete(group_id, original_key, original_env)
            return {
                "status": "renamed",
                "variable": r_create.json(),
                "deleted_old": {"key": original_key, "environment_scope": original_env},
            }

        r_get = await self._request(
            "GET",
            f"/groups/{group_id}/variables/{new_key}",
            params=params_new,
            timeout=settings.REQUEST_TIMEOUT_S,
        )
        if r_get.status_code == 200:
            if mah:
                await self._group_var_delete(group_id, new_key, new_env)
                create_body = dict(body_common, key=new_key, masked=True)
                create_body["masked_and_hidden"] = True
                r_create = await self._request(
                    "POST",
                    f"/groups/{group_id}/variables",
                    content=json.dumps(create_body),
                    timeout=settings.REQUEST_TIMEOUT_S,
                )
                self._raise_for_status(r_create)
                return {
                    "status": "renamed",
                    "variable": r_create.json(),
                    "deleted_old": {"key": new_key, "environment_scope": new_env},
                }

            r_put = await self._request(
                "PUT",
                f"/groups/{group_id}/variables/{new_key}",
                params=params_new,
                content=json.dumps(body_common),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_put)
            return {"status": "updated", "variable": r_put.json()}

        if r_get.status_code == 404:
            create_body = dict(body_common, key=new_key)
            if mah:
                create_body["masked_and_hidden"] = True
            r_post = await self._request(
                "POST",
                f"/groups/{group_id}/variables",
                content=json.dumps(create_body),
                timeout=settings.REQUEST_TIMEOUT_S,
            )
            self._raise_for_status(r_post)
            return {"status": "created", "variable": r_post.json()}

        self._raise_for_status(r_get)
        raise HTTPException(500, "Unexpected flow")
