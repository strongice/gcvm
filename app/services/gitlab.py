from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import asyncio
import hashlib
import httpx
from fastapi import HTTPException
import logging
import pathlib
import time
from datetime import datetime, timezone

from email.utils import format_datetime

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
        try:
            self._project_cache_ttl = max(0, int(settings.PROJECTS_CACHE_TTL_S))
        except Exception:
            self._project_cache_ttl = 0
        try:
            self._group_tree_cache_ttl = max(0, int(settings.GROUP_TREE_CACHE_TTL_S))
        except Exception:
            self._group_tree_cache_ttl = 60

        snapshot_path = pathlib.Path(settings.GROUP_TREE_SNAPSHOT_PATH).expanduser()
        if not snapshot_path.is_absolute():
            snapshot_path = pathlib.Path.cwd() / snapshot_path
        self._group_tree_snapshot_path = snapshot_path

        self._group_tree_cache: Optional[Dict[str, Any]] = None
        self._group_tree_snapshot_mtime: Optional[float] = None
        self._group_tree_lock = asyncio.Lock()
        self._group_tree_refresh_task: Optional[asyncio.Task] = None
        self._load_group_tree_snapshot()

    # ---------- cache helpers ----------
    def _cache_get(self, key: Tuple[Any, ...]) -> Optional[Any]:
        rec = self._cache.get(key)
        if not rec:
            return None
        expires_at, value = rec
        if expires_at is None or expires_at >= time.time():
            return value
        self._cache.pop(key, None)
        return None

    def _cache_set(self, key: Tuple[Any, ...], value: Any, ttl: Optional[int] = None) -> None:
        ttl_base = self._cache_ttl if ttl is None else max(0, int(ttl))
        if ttl_base <= 0:
            self._cache.pop(key, None)
            return
        self._cache[key] = (time.time() + ttl_base, value)

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
    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[float]:
        if not value:
            return None
        try:
            cleaned = value
            if cleaned.endswith("Z"):
                cleaned = cleaned[:-1] + "+00:00"
            return datetime.fromisoformat(cleaned).timestamp()
        except Exception:
            return None

    def _read_group_tree_snapshot(self) -> Optional[Dict[str, Any]]:
        path = self._group_tree_snapshot_path
        try:
            if not path.exists():
                return None
            mtime = path.stat().st_mtime
            raw = path.read_text("utf-8")
            data = json.loads(raw)
        except FileNotFoundError:
            return None
        except Exception:
            logger.warning("Failed to load group tree snapshot from %s", path, exc_info=True)
            return None

        tree = data.get("tree")
        if not isinstance(tree, list):
            return None

        hash_value = data.get("hash") or self._compute_tree_hash(tree)
        stored_at = float(data.get("stored_at") or 0) or time.time()
        last_modified_iso = data.get("last_modified") or datetime.fromtimestamp(stored_at, tz=timezone.utc).isoformat()
        last_modified_http = data.get("last_modified_http") or format_datetime(
            datetime.fromtimestamp(stored_at, tz=timezone.utc), usegmt=True
        )
        expires = (
            stored_at + self._group_tree_cache_ttl
            if self._group_tree_cache_ttl > 0
            else float("inf")
        )
        latest_group_updated_at_ts = data.get("latest_group_updated_at_ts")
        if latest_group_updated_at_ts is not None:
            try:
                latest_group_updated_at_ts = float(latest_group_updated_at_ts)
            except Exception:
                latest_group_updated_at_ts = None
        if latest_group_updated_at_ts is None:
            latest_group_updated_at_ts = self._parse_timestamp(data.get("latest_group_updated_at"))

        payload: Dict[str, Any] = {
            "tree": tree,
            "hash": hash_value,
            "last_modified": last_modified_iso,
            "last_modified_http": last_modified_http,
            "last_modified_ts": stored_at,
            "expires": expires,
            "latest_group_updated_at_ts": latest_group_updated_at_ts,
            "latest_group_updated_at": data.get("latest_group_updated_at") if isinstance(data.get("latest_group_updated_at"), str) else None,
            "snapshot_mtime": mtime,
        }
        return payload

    def _load_group_tree_snapshot(self) -> None:
        if self._group_tree_cache is not None:
            return
        payload = self._read_group_tree_snapshot()
        if not payload:
            return
        payload["_index"] = self._build_group_tree_index(payload["tree"])
        self._group_tree_cache = payload
        self._group_tree_snapshot_mtime = payload.get("snapshot_mtime")
        logger.info("Loaded group tree snapshot from %s", self._group_tree_snapshot_path)

    @staticmethod
    def _clone_tree(tree: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        try:
            return json.loads(json.dumps(tree))
        except Exception:
            return tree

    @staticmethod
    def _compute_tree_hash(tree: List[Dict[str, Any]]) -> str:
        payload = json.dumps(tree, sort_keys=True, ensure_ascii=False).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def _build_group_tree_index(tree: List[Dict[str, Any]]) -> Dict[str, Any]:
        by_id: Dict[int, Dict[str, Any]] = {}
        parent: Dict[int, Optional[int]] = {}
        depth: Dict[int, int] = {}

        stack: List[Tuple[Dict[str, Any], Optional[int], int]] = []
        for node in tree:
            stack.append((node, None, 0))

        while stack:
            node, parent_id, level = stack.pop()
            group = node.get("group", {})
            gid = group.get("id")
            if gid is None:
                continue
            by_id[gid] = node
            parent[gid] = parent_id
            depth[gid] = level
            children = node.get("children", []) or []
            for child in reversed(children):
                stack.append((child, gid, level + 1))

        return {
            "by_id": by_id,
            "parent": parent,
            "depth": depth,
        }

    async def _fetch_group_tree_from_gitlab(self) -> Dict[str, Any]:
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
            "order_by": "path",
            "sort": "asc",
        }
        items = await self._paginated_get("/groups", params)

        by_id: Dict[int, Dict[str, Any]] = {}
        latest_group_updated_at_ts: Optional[float] = None
        for g in items:
            gid = g.get("id")
            if gid is None:
                continue
            updated_ts = self._parse_timestamp(g.get("updated_at"))
            if updated_ts is not None:
                if latest_group_updated_at_ts is None or updated_ts > latest_group_updated_at_ts:
                    latest_group_updated_at_ts = updated_ts
            by_id[gid] = {
                "group": {
                    "id": gid,
                    "name": g.get("name") or g.get("path"),
                    "full_path": g.get("full_path"),
                    "parent_id": g.get("parent_id"),
                    "projects_count": g.get("projects_count"),
                    "subgroups_count": g.get("subgroup_count") or g.get("subgroups_count"),
                },
                "children": [],
            }

        roots: List[Dict[str, Any]] = []
        for node in by_id.values():
            parent_id = node["group"].get("parent_id")
            if parent_id and parent_id in by_id:
                by_id[parent_id]["children"].append(node)
            else:
                roots.append(node)

        def sort_nodes(nodes: List[Dict[str, Any]]) -> None:
            nodes.sort(key=lambda n: (n["group"].get("name") or n["group"].get("full_path") or "").lower())
            for child in nodes:
                sort_nodes(child["children"])

        sort_nodes(roots)

        now = datetime.now(timezone.utc)
        now_ts = now.timestamp()
        tree = self._clone_tree(roots)
        latest_updated_iso = (
            datetime.fromtimestamp(latest_group_updated_at_ts, tz=timezone.utc).isoformat()
            if latest_group_updated_at_ts
            else None
        )
        payload = {
            "tree": tree,
            "hash": self._compute_tree_hash(tree),
            "last_modified": now.isoformat(),
            "last_modified_http": format_datetime(now, usegmt=True),
            "last_modified_ts": now_ts,
            "expires": now_ts + self._group_tree_cache_ttl if self._group_tree_cache_ttl > 0 else float("inf"),
            "latest_group_updated_at_ts": latest_group_updated_at_ts,
            "latest_group_updated_at": latest_updated_iso,
            "_index": self._build_group_tree_index(tree),
        }
        return payload

    async def _write_group_tree_snapshot(self, payload: Dict[str, Any]) -> None:
        path = self._group_tree_snapshot_path
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "tree": payload["tree"],
                "hash": payload["hash"],
                "last_modified": payload["last_modified"],
                "last_modified_http": payload["last_modified_http"],
                "stored_at": payload["last_modified_ts"],
                "latest_group_updated_at": payload.get("latest_group_updated_at"),
                "latest_group_updated_at_ts": payload.get("latest_group_updated_at_ts"),
            }
            text = json.dumps(data, ensure_ascii=False)
            await asyncio.to_thread(path.write_text, text, "utf-8")
            try:
                self._group_tree_snapshot_mtime = path.stat().st_mtime
            except Exception:
                self._group_tree_snapshot_mtime = None
            logger.info("Saved group tree snapshot to %s", path)
        except Exception:
            logger.warning("Failed to write group tree snapshot to %s", path, exc_info=True)

    def _schedule_group_tree_refresh(self) -> None:
        if self._group_tree_refresh_task and not self._group_tree_refresh_task.done():
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._group_tree_refresh_task = loop.create_task(self._safe_refresh_group_tree())

    async def _safe_refresh_group_tree(self) -> None:
        try:
            await self._refresh_group_tree()
        except Exception:
            logger.warning("Background group tree refresh failed", exc_info=True)

    async def _refresh_group_tree(self) -> Dict[str, Any]:
        payload = await self._fetch_group_tree_from_gitlab()
        async with self._group_tree_lock:
            payload["_index"] = self._build_group_tree_index(payload["tree"])
            self._group_tree_cache = payload
        await self._write_group_tree_snapshot(payload)
        return payload

    async def _ensure_group_tree(self) -> Dict[str, Any]:
        await self._reload_group_tree_snapshot_if_newer()
        async with self._group_tree_lock:
            cache = self._group_tree_cache
        if cache is None:
            cache = await self._refresh_group_tree()
            return cache
        if self._group_tree_cache_ttl > 0 and cache.get("expires", 0) <= time.time():
            self._schedule_group_tree_refresh()
        if cache.get("_index") is None:
            cache["_index"] = self._build_group_tree_index(cache["tree"])
        return cache

    async def _reload_group_tree_snapshot_if_newer(self) -> None:
        payload = self._read_group_tree_snapshot()
        if not payload:
            return
        snapshot_mtime = payload.pop("snapshot_mtime", None)
        if (
            self._group_tree_snapshot_mtime is not None
            and snapshot_mtime is not None
            and snapshot_mtime <= self._group_tree_snapshot_mtime
        ):
            return
        async with self._group_tree_lock:
            payload["_index"] = self._build_group_tree_index(payload["tree"])
            self._group_tree_cache = payload
        self._group_tree_snapshot_mtime = snapshot_mtime
        logger.info("Reloaded group tree snapshot from %s", self._group_tree_snapshot_path)

    async def _latest_group_update_ts(self) -> Optional[float]:
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
            "order_by": "id",
            "sort": "desc",
            "per_page": 100,
            "page": 1,
        }
        r = await self._request("GET", "/groups", params=params, timeout=settings.REQUEST_TIMEOUT_S)
        self._raise_for_status(r)
        data = r.json()
        if not isinstance(data, list):
            return None
        latest: Optional[float] = None
        for item in data:
            ts = self._parse_timestamp(item.get("updated_at"))
            if ts is not None and (latest is None or ts > latest):
                latest = ts
        return latest

    async def refresh_group_tree_if_needed(self, force: bool = False) -> bool:
        """Refresh the cached group tree if remote data changed.

        Returns True when a refresh happened."""

        await self._reload_group_tree_snapshot_if_newer()
        async with self._group_tree_lock:
            cache = self._group_tree_cache

        if cache is None:
            await self._refresh_group_tree()
            return True

        if force:
            await self._refresh_group_tree()
            return True

        now = time.time()
        if self._group_tree_cache_ttl > 0 and cache.get("expires", 0) <= now:
            await self._refresh_group_tree()
            return True

        try:
            remote_ts = await self._latest_group_update_ts()
        except Exception:
            logger.warning("Failed to check latest group update timestamp", exc_info=True)
            return False

        local_ts = cache.get("latest_group_updated_at_ts")
        if remote_ts is None:
            return False
        if local_ts is None or remote_ts > local_ts + 1e-6:
            await self._refresh_group_tree()
            return True
        return False

    def _resolve_group_children(self, cache: Dict[str, Any], parent_id: Optional[int]) -> List[Dict[str, Any]]:
        if parent_id is None:
            return cache.get("tree", []) or []
        index = cache.get("_index") or self._build_group_tree_index(cache.get("tree", []) or [])
        cache["_index"] = index
        node = index["by_id"].get(parent_id)
        if not node:
            return []
        return node.get("children", []) or []

    @staticmethod
    def _serialize_group_node(node: Dict[str, Any]) -> Dict[str, Any]:
        group = dict(node.get("group", {}))
        children = node.get("children", []) or []
        return {
            "group": group,
            "children_count": len(children),
            "has_children": len(children) > 0,
        }

    async def list_groups_page(
        self,
        parent_id: Optional[int] = None,
        cursor: Optional[str] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        cache = await self._ensure_group_tree()
        nodes = self._resolve_group_children(cache, parent_id)

        total = len(nodes)
        try:
            offset = int(cursor or 0)
            if offset < 0:
                offset = 0
        except Exception:
            offset = 0

        limit = max(1, min(int(limit or 1), 200))
        slice_nodes = nodes[offset : offset + limit]

        items = [self._serialize_group_node(node) for node in slice_nodes]
        consumed = offset + len(slice_nodes)
        next_cursor_val = consumed if consumed < total else None

        response = {
            "items": items,
            "total": total,
            "has_more": next_cursor_val is not None,
            "next_cursor": str(next_cursor_val) if next_cursor_val is not None else None,
            "hash": cache.get("hash"),
            "last_modified": cache.get("last_modified"),
            "last_modified_http": cache.get("last_modified_http"),
        }
        if parent_id is not None:
            response["parent_id"] = parent_id
        return response

    async def get_group_path(self, group_id: int) -> List[Dict[str, Any]]:
        cache = await self._ensure_group_tree()
        index = cache.get("_index") or self._build_group_tree_index(cache.get("tree", []) or [])
        cache["_index"] = index

        by_id: Dict[int, Dict[str, Any]] = index.get("by_id", {})
        parent_map: Dict[int, Optional[int]] = index.get("parent", {})

        if group_id not in by_id:
            return []

        path: List[Dict[str, Any]] = []
        current: Optional[int] = group_id
        while current is not None:
            node = by_id.get(current)
            if not node:
                break
            entry = dict(node.get("group", {}))
            entry["children_count"] = len(node.get("children", []) or [])
            path.append(entry)
            current = parent_map.get(current)

        path.reverse()
        return path

    @staticmethod
    def _filter_tree(tree: List[Dict[str, Any]], search: str) -> List[Dict[str, Any]]:
        search_lc = search.lower()

        def filter_node(node: Dict[str, Any]) -> bool:
            grp = node.get("group", {})
            group_match = (
                (grp.get("name") and search_lc in str(grp.get("name")).lower())
                or (grp.get("full_path") and search_lc in str(grp.get("full_path")).lower())
            )
            kept_children: List[Dict[str, Any]] = []
            for child in node.get("children", []):
                if filter_node(child):
                    kept_children.append(child)
            node["children"] = kept_children
            return group_match or bool(kept_children)

        return [node for node in tree if filter_node(node)]

    async def prime_group_tree(self) -> None:
        try:
            await self._refresh_group_tree()
        except Exception:
            logger.warning("Initial group tree refresh failed", exc_info=True)

    async def list_groups(
        self,
        search: Optional[str] = None,
        since_ts: Optional[float] = None,
        known_hash: Optional[str] = None,
    ) -> Dict[str, Any]:
        cache = await self._ensure_group_tree()

        if search:
            tree = self._filter_tree(self._clone_tree(cache["tree"]), search)
            return {
                "changed": True,
                "hash": cache["hash"],
                "last_modified": cache["last_modified"],
                "last_modified_http": cache.get("last_modified_http"),
                "tree": tree,
            }

        unchanged = False
        if known_hash and known_hash == cache["hash"]:
            unchanged = True
        elif since_ts and cache.get("last_modified_ts") and since_ts >= cache["last_modified_ts"]:
            unchanged = True

        if unchanged:
            return {
                "changed": False,
                "hash": cache["hash"],
                "last_modified": cache["last_modified"],
                "last_modified_http": cache.get("last_modified_http"),
            }

        tree = self._clone_tree(cache["tree"])
        return {
            "changed": True,
            "hash": cache["hash"],
            "last_modified": cache["last_modified"],
            "last_modified_http": cache.get("last_modified_http"),
            "tree": tree,
        }

    async def count_groups(self) -> int:
        ck = ("count_groups",)
        cached = self._cache_get(ck)
        if cached is not None:
            return int(cached)
        params: Dict[str, Any] = {
            "membership": True,
            "include_subgroups": True,
        }
        total = await self._count("/groups", params)
        self._cache_set(ck, int(total))
        return total

    # list_top_groups / list_subgroups — удалены (откат варианта A)

    # ---------- projects (все доступные токену) ----------
    async def list_projects(
        self,
        group_id: Optional[int] = None,
        search: Optional[str] = None,
        limit: Optional[int] = None,
        page: Optional[int] = None,
        per_page: Optional[int] = None,
        lazy: bool = False,
    ) -> Any:
        """Получить проекты. В lazy-режиме возвращает одну страницу с метаданными."""

        lazy_mode = lazy or page is not None or per_page is not None
        if lazy_mode:
            per_page_effective = per_page or limit or 20
            per_page_effective = max(1, min(int(per_page_effective), 200))
            page_effective = max(1, int(page or 1))

            ck = ("list_projects_page", group_id or 0, search or "", per_page_effective, page_effective)
            cached = self._cache_get(ck)
            if cached is not None:
                return cached

            params: Dict[str, Any] = {
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
                "per_page": per_page_effective,
                "page": page_effective,
            }
            if search:
                params["search"] = search
            if group_id:
                params["with_shared"] = True
                url = f"/groups/{group_id}/projects"
            else:
                params["membership"] = True
                params["simple"] = True
                url = "/projects"

            r = await self._request("GET", url, params=params, timeout=settings.REQUEST_TIMEOUT_S)
            self._raise_for_status(r)
            chunk = r.json()
            if not isinstance(chunk, list):
                raise HTTPException(502, "Unexpected response structure for projects")

            out: List[Dict[str, Any]] = []
            for p in chunk:
                ns = (p.get("namespace", {}) or {})
                out.append(
                    {
                        "id": p.get("id"),
                        "name": p.get("name") or p.get("path"),
                        "path_with_namespace": p.get("path_with_namespace"),
                        "namespace_id": ns.get("id"),
                        "namespace_full_path": ns.get("full_path"),
                    }
                )

            next_page_header = r.headers.get("X-Next-Page")
            next_page_value = int(next_page_header) if next_page_header and next_page_header != "0" else None
            has_more = next_page_value is not None

            payload = {
                "items": out,
                "next_page": next_page_value,
                "has_more": has_more,
            }
            self._cache_set(ck, payload, ttl=self._project_cache_ttl)
            return payload

        # non-lazy mode (full list)
        ck = ("list_projects_full", group_id or 0, search or "", int(limit or 0))
        cached = self._cache_get(ck)
        if cached is not None:
            return cached

        per_page_full = max(1, min(int(settings.GITLAB_PER_PAGE or 100), 200))
        collected: List[Dict[str, Any]] = []

        def map_project(p: Dict[str, Any]) -> Dict[str, Any]:
            ns = (p.get("namespace", {}) or {})
            return {
                "id": p.get("id"),
                "name": p.get("name") or p.get("path"),
                "path_with_namespace": p.get("path_with_namespace"),
                "namespace_id": ns.get("id"),
                "namespace_full_path": ns.get("full_path"),
            }

        if group_id:
            base_params: Dict[str, Any] = {
                "with_shared": True,
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                base_params["search"] = search
            page_idx = 1
            while True:
                p = dict(base_params, per_page=per_page_full, page=page_idx)
                r = await self._request("GET", f"/groups/{group_id}/projects", params=p, timeout=settings.REQUEST_TIMEOUT_S)
                self._raise_for_status(r)
                chunk = r.json()
                if not isinstance(chunk, list):
                    raise HTTPException(502, "Unexpected response structure for projects")
                collected.extend(map_project(proj) for proj in chunk)
                if limit and len(collected) >= limit:
                    break
                next_page = r.headers.get("X-Next-Page")
                if not next_page or next_page == "0":
                    break
                page_idx = int(next_page)
        else:
            base_params = {
                "membership": True,
                "simple": True,
                "order_by": "path",
                "sort": "asc",
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                base_params["search"] = search
            page_idx = 1
            while True:
                p = dict(base_params, per_page=per_page_full, page=page_idx)
                r = await self._request("GET", "/projects", params=p, timeout=settings.REQUEST_TIMEOUT_S)
                self._raise_for_status(r)
                chunk = r.json()
                if not isinstance(chunk, list):
                    raise HTTPException(502, "Unexpected response structure for projects")
                collected.extend(map_project(proj) for proj in chunk)
                if limit and len(collected) >= limit:
                    break
                next_page = r.headers.get("X-Next-Page")
                if not next_page or next_page == "0":
                    break
                page_idx = int(next_page)

        out_full = collected[: (limit or len(collected))]
        self._cache_set(ck, out_full, ttl=self._project_cache_ttl)
        return out_full

    async def count_projects(self, group_id: Optional[int] = None, search: Optional[str] = None) -> int:
        ck = ("count_projects", group_id or 0, search or "")
        cached = self._cache_get(ck)
        if cached is not None:
            return int(cached)
        if group_id:
            params: Dict[str, Any] = {
                "with_shared": True,
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            total = await self._count(f"/groups/{group_id}/projects", params)
            self._cache_set(ck, int(total))
            return total
        else:
            params = {
                "membership": True,
                "simple": True,
                "min_access_level": settings.GITLAB_MIN_ACCESS_LEVEL,
            }
            if search:
                params["search"] = search
            total = await self._count("/projects", params)
            self._cache_set(ck, int(total))
            return total

    async def sample_projects(self, limit: int = 6) -> List[Dict[str, Any]]:
        ck = ("sample_projects", int(limit or 6))
        cached = self._cache_get(ck)
        if cached is not None:
            return cached
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
        self._cache_set(ck, out, ttl=self._project_cache_ttl)
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
