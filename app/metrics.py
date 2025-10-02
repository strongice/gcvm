from __future__ import annotations

from prometheus_client import Counter, Histogram

WORKER_REFRESH_TOTAL = Counter(
    "gitlab_worker_refresh_total",
    "Количество обновлений кэша дерева групп",
    labelnames=("result",),
)

WORKER_REFRESH_LATENCY = Histogram(
    "gitlab_worker_refresh_seconds",
    "Продолжительность обновления дерева групп",
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60),
)

GROUP_PAGE_REQUESTS = Counter(
    "gitlab_group_page_requests_total",
    "Количество запросов к ленивым страницам групп",
    labelnames=("endpoint", "result"),
)

