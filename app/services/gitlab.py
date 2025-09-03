from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
import logging

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
        r = await self.http.request(method, url, headers=HEADERS, **kwargs)
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
        params.setdefault("per_page", settings.GITLAB_PER_PAGE)
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

    # ---------- meta ----------
    async def get_user(self) -> Dict[str, Any]:
        r = await self._request("GET", "/user", timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        return r.json()

    # ---------- groups ----------
    async def list_groups(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
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

    # list_top_groups / list_subgroups — удалены (откат варианта A)

    # ---------- projects (все доступные токену) ----------
    async def list_projects(self, group_id: Optional[int] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Возвращает все проекты, доступные токену (без фильтрации по ролям).
        """
        if group_id:
            params: Dict[str, Any] = {
                "with_shared": True,
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            items = await self._paginated_get(f"/groups/{group_id}/projects", params)
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
            items = await self._paginated_get("/projects", params)

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
        r = await self._request("GET", f"/projects/{project_id}/environments", params={"states": "available"})
        if r.status_code in (400, 422):
            r = await self._request("GET", f"/projects/{project_id}/environments")
        self._raise_for_status(r)
        items = r.json()
        names = [it.get("name") for it in items if isinstance(it, dict) and it.get("name")]
        return sorted({n for n in names}, key=lambda s: s.lower())

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
