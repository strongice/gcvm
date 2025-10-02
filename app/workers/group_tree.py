from __future__ import annotations

import asyncio
import logging
from time import perf_counter

from app.metrics import WORKER_REFRESH_LATENCY, WORKER_REFRESH_TOTAL
from app.services.gitlab import GitLabClient

logger = logging.getLogger(__name__)


async def _worker_loop(
    gitlab: GitLabClient,
    interval: float,
    stop_event: asyncio.Event,
    *,
    run_immediately: bool = True,
) -> None:
    """Background loop that keeps the group tree cache in sync."""

    interval = max(1.0, float(interval or 0))

    if run_immediately:
        await _refresh_once(gitlab)

    while not stop_event.is_set():
        start = perf_counter()
        result_label = "error"
        try:
            refreshed = await gitlab.refresh_group_tree_if_needed()
            result_label = "updated" if refreshed else "skipped"
            if refreshed:
                logger.info("group-tree worker: cache refreshed")
            else:
                logger.debug("group-tree worker: cache already fresh")
        except Exception:
            logger.exception("group-tree worker: iteration failed")
        finally:
            duration = perf_counter() - start
            WORKER_REFRESH_LATENCY.observe(duration)
            WORKER_REFRESH_TOTAL.labels(result=result_label).inc()

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue


async def _refresh_once(gitlab: GitLabClient) -> None:
    try:
        refreshed = await gitlab.refresh_group_tree_if_needed(force=False)
        if refreshed:
            logger.info("group-tree worker: initial refresh completed")
        else:
            logger.debug("group-tree worker: initial cache up-to-date")
    except Exception:
        logger.exception("group-tree worker: initial refresh failed")


async def run_inline_worker(
    gitlab: GitLabClient,
    interval: float,
    stop_event: asyncio.Event,
    *,
    run_immediately: bool = True,
) -> None:
    """Run worker loop using an existing GitLab client (inline mode)."""

    logger.info(
        "group-tree worker: starting inline loop (interval=%ss, run_immediately=%s)",
        interval,
        run_immediately,
    )
    try:
        await _worker_loop(gitlab, interval, stop_event, run_immediately=run_immediately)
    finally:
        logger.info("group-tree worker: inline loop stopped")
