import React from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";

import { api } from "../api";
import type {
  Group,
  GroupNodeItem,
  GroupTreeNode,
  Project,
  ProjectListPage,
} from "../types";
import { VirtualList } from "./VirtualList";
import { useI18n } from "../i18n/context";

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ProjectsSnapshot = {
  items: Project[];
  loading: boolean;
  error?: string;
  searchKey: string;
  fetchedAt: number;
  nextPage?: number | null;
  hasMore?: boolean;
  firstPageItems?: Project[];
  firstPageNext?: number | null;
  allItems?: Project[];
};

const PROJECT_CACHE_TTL_MS = 30_000;
const PROJECTS_PAGE_SIZE = 3;
const PROJECT_PREF_KEY = "ui_project_list_pref_v1";

const ROOT_INITIAL_LIMIT = 6;
const CHILD_INITIAL_LIMIT = 4;
const ROOT_PAGE_LIMIT = 24;
const CHILD_PAGE_LIMIT = 12;
const GROUP_ROW_HEIGHT = 56;

function loadProjectPrefs(): Map<string, boolean> {
  try {
    const raw = sessionStorage.getItem(PROJECT_PREF_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return new Map();
    const map = new Map<string, boolean>();
    Object.entries(parsed).forEach(([key, value]) => {
      if (value) map.set(key, true);
    });
    return map;
  } catch {
    return new Map();
  }
}

function persistProjectPrefs(map: Map<string, boolean>) {
  try {
    const obj: Record<string, boolean> = {};
    map.forEach((value, key) => {
      if (value) obj[key] = true;
    });
    sessionStorage.setItem(PROJECT_PREF_KEY, JSON.stringify(obj));
  } catch {}
}

function pathSegment(fullPath?: string | null): string {
  if (!fullPath) return "";
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : fullPath;
}

function findNodeById(nodes: GroupTreeNode[], id: number): GroupTreeNode | null {
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.group.id === id) return node;
    for (const child of node.children) {
      stack.push(child);
    }
  }
  return null;
}

function flattenNodes(nodes: GroupTreeNode[], depth = 0, results: GroupSearchResult[] = []): GroupSearchResult[] {
  for (const node of nodes) {
    results.push({ group: node.group, depth });
    if (node.children?.length) {
      flattenNodes(node.children, depth + 1, results);
    }
  }
  return results;
}

type GroupListState = {
  items: GroupNodeItem[];
  cursor: string | null;
  total: number;
  loading: boolean;
  error?: string;
  initialLimit: number;
  displayCount: number;
};

type GroupPathEntry = Group & { children_count?: number };

type GroupSearchResult = {
  group: Group;
  depth: number;
};

type ProjectSearchResult = Project;

export type SidebarProps = {
  selectedGroupId?: number | null;
  selectedProjectId?: number | null;
  onPickGroup: (group: Group) => void | boolean | Promise<void | boolean>;
  onPickProject: (project: Project) => void;
  fetchProjects: (groupId: number, search: string, page: number) => Promise<ProjectListPage>;
  fetchAllProjects: (groupId: number, search: string) => Promise<Project[]>;
  onResetGroups?: () => void;
};

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n();
  const {
    selectedGroupId,
    selectedProjectId,
    onPickGroup,
    onPickProject,
    fetchProjects,
    fetchAllProjects,
    onResetGroups,
  } = props;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const [groupLists, setGroupLists] = React.useState<Record<string, GroupListState>>({});
  const groupListsRef = React.useRef(groupLists);
  React.useEffect(() => {
    groupListsRef.current = groupLists;
  }, [groupLists]);

  const [groupPath, setGroupPath] = React.useState<GroupPathEntry[]>([]);
  const [groupPathLoading, setGroupPathLoading] = React.useState(false);
  const [groupPathError, setGroupPathError] = React.useState<string | undefined>();

  const [groupSearch, setGroupSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<GroupSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = React.useState(false);
  const [searchProjectResults, setSearchProjectResults] = React.useState<ProjectSearchResult[]>([]);
  const [searchProjectLoading, setSearchProjectLoading] = React.useState(false);
  const [searchProjectError, setSearchProjectError] = React.useState<string | undefined>();
  const searchTimerRef = React.useRef<number | null>(null);

  const [projectsMap, setProjectsMap] = React.useState<Map<number, ProjectsSnapshot>>(() => new Map());
  const projectPrefsRef = React.useRef<Map<string, boolean>>(loadProjectPrefs());

  const rootMetaRef = React.useRef<{ hash?: string; lastModifiedHttp?: string }>({});
  const revalidateTickRef = React.useRef(false);

  const updateProjectPref = React.useCallback((groupId: number, searchKey: string, expanded: boolean) => {
    const key = `${groupId}:${searchKey}`;
    if (expanded) {
      projectPrefsRef.current.set(key, true);
    } else {
      projectPrefsRef.current.delete(key);
    }
    persistProjectPrefs(projectPrefsRef.current);
  }, []);

  const clearProjectPref = React.useCallback((groupId: number, searchKey: string) => {
    const key = `${groupId}:${searchKey}`;
    if (projectPrefsRef.current.delete(key)) {
      persistProjectPrefs(projectPrefsRef.current);
    }
  }, []);

  const keyForParent = React.useCallback((parentId: number | null) => (parentId === null ? "root" : String(parentId)), []);

  const loadGroupList = React.useCallback(
    async (parentId: number | null, options: { reset?: boolean; initialLimit?: number } = {}) => {
      const key = keyForParent(parentId);
      const prev = groupListsRef.current[key];
      if (prev?.loading && !options.reset) {
        return;
      }

      const initialLimit = options.initialLimit ?? prev?.initialLimit ?? (parentId === null ? ROOT_INITIAL_LIMIT : CHILD_INITIAL_LIMIT);
      const cursor = options.reset ? null : prev?.cursor ?? null;
      const pageSize = cursor
        ? parentId === null
          ? ROOT_PAGE_LIMIT
          : CHILD_PAGE_LIMIT
        : initialLimit;

      setGroupLists((prevLists) => ({
        ...prevLists,
        [key]: {
          items: cursor ? prev?.items ?? [] : prev?.items ?? [],
          cursor: prev?.cursor ?? null,
          total: prev?.total ?? 0,
          loading: true,
          error: undefined,
          initialLimit,
          displayCount: prev?.displayCount ?? Math.min(initialLimit, prev?.items?.length ?? 0),
        },
      }));

      try {
        const response = parentId === null
          ? await api.groupsRootPage({ cursor: cursor ?? undefined, limit: pageSize })
          : await api.groupChildrenPage(parentId, { cursor: cursor ?? undefined, limit: pageSize });

        if (parentId === null) {
          rootMetaRef.current = {
            hash: response.hash ?? rootMetaRef.current.hash,
            lastModifiedHttp: response.last_modified_http ?? rootMetaRef.current.lastModifiedHttp,
          };
        }

        const previousItems = cursor && prev ? prev.items : [];
        const items = cursor && previousItems.length ? [...previousItems, ...response.items] : response.items;
        const displayCount = cursor && prev
          ? Math.min(prev.displayCount + response.items.length, items.length)
          : Math.min(items.length, initialLimit);

        setGroupLists((prevLists) => ({
          ...prevLists,
          [key]: {
            items,
            cursor: response.next_cursor ?? null,
            total: response.total ?? items.length,
            loading: false,
            error: undefined,
            initialLimit,
            displayCount,
          },
        }));
      } catch (err: any) {
        const message = err?.message || t('sidebar.error');
        setGroupLists((prevLists) => ({
          ...prevLists,
          [key]: {
            items: prev?.items ?? [],
            cursor: prev?.cursor ?? null,
            total: prev?.total ?? prev?.items?.length ?? 0,
            loading: false,
            error: message,
            initialLimit,
            displayCount: prev?.displayCount ?? Math.min(initialLimit, prev?.items?.length ?? 0),
          },
        }));
      }
    },
    [keyForParent, t],
  );

  React.useEffect(() => {
    loadGroupList(null, { reset: true, initialLimit: ROOT_INITIAL_LIMIT }).catch(() => undefined);
  }, [loadGroupList]);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchPath(groupId: number) {
      setGroupPathLoading(true);
      setGroupPathError(undefined);
      try {
        const path = await api.groupPath(groupId);
        if (!cancelled) {
          setGroupPath(path);
          setGroupPathLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setGroupPath([]);
          setGroupPathLoading(false);
          setGroupPathError(err?.message || t('sidebar.group_path.error'));
        }
      }
    }

    if (selectedGroupId && selectedGroupId > 0) {
      fetchPath(selectedGroupId);
    } else {
      setGroupPath([]);
      setGroupPathError(undefined);
      setGroupPathLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedGroupId, t]);

  React.useEffect(() => {
    const ancestors = [null, ...groupPath.map((entry) => entry.id)];
    ancestors.forEach((parentId, index) => {
      const key = keyForParent(parentId === null ? null : parentId);
      const existing = groupListsRef.current[key];
      if (!existing) {
        const initialLimit = index === 0 ? ROOT_INITIAL_LIMIT : CHILD_INITIAL_LIMIT;
        loadGroupList(parentId === null ? null : parentId, { reset: true, initialLimit }).catch(() => undefined);
      }
    });
  }, [groupPath, keyForParent, loadGroupList]);

  React.useEffect(() => {
    const intervalMs = 60_000;
    const timer = window.setInterval(async () => {
      if (revalidateTickRef.current) return;
      const meta = rootMetaRef.current;
      if (!meta.hash && !meta.lastModifiedHttp) return;
      revalidateTickRef.current = true;
      try {
        const response = await api.groups({ hash: meta.hash, since: meta.lastModifiedHttp });
        if (response.changed) {
          rootMetaRef.current = {
            hash: response.hash ?? meta.hash,
            lastModifiedHttp: response.last_modified_http ?? meta.lastModifiedHttp,
          };
          groupListsRef.current = {};
          setGroupLists({});
          await loadGroupList(null, { reset: true, initialLimit: ROOT_INITIAL_LIMIT });
          for (const entry of groupPath) {
            await loadGroupList(entry.id, { reset: true, initialLimit: CHILD_INITIAL_LIMIT });
          }
          if (selectedGroupId) {
            try {
              const path = await api.groupPath(selectedGroupId);
              setGroupPath(path);
            } catch (err) {
              console.warn('Failed to refresh group path', err);
            }
          }
        }
      } catch (err) {
        console.warn('Adaptive refresh failed', err);
      } finally {
        revalidateTickRef.current = false;
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [groupPath, loadGroupList, selectedGroupId]);

  React.useEffect(() => {
    const trimmed = groupSearch.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchProjectResults([]);
      setSearchLoading(false);
      setSearchProjectLoading(false);
      setSearchProjectError(undefined);
      return;
    }

    setSearchLoading(true);
    setSearchProjectLoading(true);
    setSearchProjectError(undefined);

    const scopeGroupId = selectedGroupId ?? (groupPath.length ? groupPath[groupPath.length - 1].id : null);

    const timer = window.setTimeout(() => {
      let active = true;

      (async () => {
        try {
          const response = await api.groups({ search: trimmed });
          if (!active) return;
          const tree = (response.tree ?? []) as GroupTreeNode[];
          let scoped: GroupTreeNode[] = tree;
          if (scopeGroupId) {
            const node = findNodeById(tree, scopeGroupId);
            scoped = node ? [node] : [];
          }
          const flattened = scoped.length ? flattenNodes(scoped, 0, []) : [];
          setSearchResults(flattened);
        } catch (err) {
          if (!active) return;
          console.warn('Group search failed', err);
          setSearchResults([]);
        } finally {
          if (active) setSearchLoading(false);
        }
      })();

      (async () => {
        try {
          const projects = await api.projects(scopeGroupId ?? null, trimmed);
          if (!active) return;
          setSearchProjectResults(projects.slice(0, 50));
        } catch (err: any) {
          if (!active) return;
          console.warn('Project search failed', err);
          setSearchProjectResults([]);
          setSearchProjectError(err?.message || t('sidebar.projects.search_error'));
        } finally {
          if (active) setSearchProjectLoading(false);
        }
      })();

      return () => {
        active = false;
      };
    }, 250);

    searchTimerRef.current = timer;

    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [groupSearch, selectedGroupId, groupPath, t]);

  const ensureProjects = React.useCallback(
    (
      groupId: number,
      searchKey: string,
      options?: { append?: boolean; page?: number; mode?: "page" | "all" },
    ) => {
      if (!groupId) return;
      const append = !!options?.append;
      const mode = options?.mode || "page";
      let targetPage = options?.page ?? 1;
      let shouldFetch = true;
      const now = Date.now();

      setProjectsMap((prev) => {
        const current = prev.get(groupId);
        const sameKey = current && current.searchKey === searchKey;
        if (!append && mode !== "all") {
          const fresh = sameKey && !current?.loading && now - (current?.fetchedAt ?? 0) < PROJECT_CACHE_TTL_MS;
          if (fresh) {
            shouldFetch = false;
            return prev;
          }
        }

        if (mode === "page" && append) {
          const nextPage = options?.page ?? current?.nextPage;
          if (!nextPage || nextPage < 1) {
            shouldFetch = false;
            return prev;
          }
          targetPage = nextPage;
        }

        const next = new Map(prev);
        next.set(groupId, {
          items: current?.items || [],
          loading: true,
          error: undefined,
          searchKey,
          fetchedAt: current?.fetchedAt ?? now,
          nextPage: current?.nextPage,
          hasMore: current?.hasMore,
          firstPageItems: current?.firstPageItems,
          firstPageNext: current?.firstPageNext,
          allItems: sameKey ? current?.allItems : undefined,
        });
        return next;
      });

      if (!shouldFetch || (mode === "page" && targetPage < 1)) return;

      if (mode === "all") {
        fetchAllProjects(groupId, searchKey)
          .then((allItems) => {
            setProjectsMap((prev) => {
              const next = new Map(prev);
              const current = next.get(groupId);
              if (!current) return prev;
              const firstItems = current.firstPageItems || current.items.slice(0, PROJECTS_PAGE_SIZE);
              const firstNext = current.firstPageNext ?? current.nextPage ?? null;
              next.set(groupId, {
                ...current,
                items: allItems,
                loading: false,
                error: undefined,
                fetchedAt: Date.now(),
                nextPage: null,
                hasMore: false,
                firstPageItems: firstItems.length ? firstItems : allItems.slice(0, PROJECTS_PAGE_SIZE),
                firstPageNext: firstNext,
                allItems,
              });
              return next;
            });
            updateProjectPref(groupId, searchKey, true);
          })
          .catch((err: any) => {
        const message = err?.message || t('sidebar.projects.error');
            setProjectsMap((prev) => {
              const next = new Map(prev);
              const current = next.get(groupId);
              next.set(groupId, {
                ...(current || {}),
                items: current?.items || [],
                loading: false,
                error: message,
                fetchedAt: current?.fetchedAt ?? Date.now(),
              });
              return next;
            });
          });
        return;
      }

      fetchProjects(groupId, searchKey, targetPage)
        .then((payload) => {
          setProjectsMap((prev) => {
            const next = new Map(prev);
            const current = next.get(groupId);
            if (!current) return prev;
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const nextPage = payload?.next_page ?? null;
            const hasMore = payload?.has_more ?? false;
            const mergedItems = append ? [...current.items, ...items] : items;
            const firstPageItems = append
              ? current.firstPageItems || current.items.slice(0, PROJECTS_PAGE_SIZE)
              : items;
            const firstPageNext = append ? current.firstPageNext : nextPage;
            next.set(groupId, {
              items: mergedItems,
              loading: false,
              error: undefined,
              searchKey,
              fetchedAt: Date.now(),
              nextPage,
              hasMore,
              firstPageItems,
              firstPageNext,
              allItems: current?.allItems,
            });
            return next;
          });
          if (mode === "page" && append) {
            updateProjectPref(groupId, searchKey, true);
          }
        })
        .catch((err: any) => {
          const message = err?.message || t('sidebar.projects.error');
          setProjectsMap((prev) => {
            const next = new Map(prev);
            const current = next.get(groupId);
            next.set(groupId, {
              items: current?.items || [],
              loading: false,
              error: message,
              searchKey,
              fetchedAt: current?.fetchedAt ?? Date.now(),
              nextPage: current?.nextPage,
              hasMore: current?.hasMore,
              firstPageItems: current?.firstPageItems,
              firstPageNext: current?.firstPageNext,
              allItems: current?.allItems,
            });
            return next;
          });
        });
    },
    [fetchAllProjects, fetchProjects, updateProjectPref],
  );

  const rememberScroll = React.useCallback(() => {
    try {
      const top = scrollRef.current?.scrollTop ?? 0;
      sessionStorage.setItem("ui_sidebar_scroll_top", String(Math.max(0, Math.floor(top))));
    } catch {}
  }, []);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const handler = () => rememberScroll();
    node.addEventListener("scroll", handler);
    return () => {
      node.removeEventListener("scroll", handler);
      rememberScroll();
    };
  }, [rememberScroll]);

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem("ui_sidebar_scroll_top");
      const top = raw ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(top) && scrollRef.current) {
        scrollRef.current.scrollTop = top;
      }
    } catch {}
  }, []);

  const effectivePathIds = React.useMemo(() => groupPath.map((entry) => entry.id), [groupPath]);

  const activeGroupId = React.useMemo(() => {
    if (selectedGroupId && selectedGroupId > 0) return selectedGroupId;
    if (effectivePathIds.length) return effectivePathIds[effectivePathIds.length - 1];
    return undefined;
  }, [selectedGroupId, effectivePathIds]);

  React.useEffect(() => {
    if (typeof activeGroupId === "number") {
      const prefKey = `${activeGroupId}:${groupSearch.trim()}`;
      const preferAll = projectPrefsRef.current.get(prefKey) === true;
      ensureProjects(activeGroupId, groupSearch.trim(), {
        append: false,
        page: 1,
        mode: preferAll ? "all" : "page",
      });
    }
  }, [activeGroupId, ensureProjects, groupSearch]);

  const projectsState = typeof activeGroupId === "number" ? projectsMap.get(activeGroupId) : undefined;
  const currentProjects = projectsState?.items || [];
  const projectsLoading = projectsState?.loading || false;
  const projectsError = projectsState?.error;

  const currentGroup = groupPath.length ? groupPath[groupPath.length - 1] : undefined;

  const rootKey = keyForParent(null);
  const rootListState = groupLists[rootKey];
  const currentListKey = keyForParent(activeGroupId ?? null);
  const currentListState = groupLists[currentListKey];

  const isSearchMode = groupSearch.trim().length > 0;

  const handleShowMoreGroups = React.useCallback(
    (parentId: number | null) => {
      const key = keyForParent(parentId);
      const state = groupListsRef.current[key];
      if (!state) {
        const initialLimit = parentId === null ? ROOT_INITIAL_LIMIT : CHILD_INITIAL_LIMIT;
        loadGroupList(parentId, { reset: true, initialLimit }).catch(() => undefined);
        return;
      }
      if (state.cursor) {
        loadGroupList(parentId, { initialLimit: state.initialLimit }).catch(() => undefined);
        return;
      }
      if (state.displayCount < state.items.length) {
        setGroupLists((prev) => ({
          ...prev,
          [key]: {
            ...state,
            displayCount: state.items.length,
          },
        }));
      }
    },
    [keyForParent, loadGroupList],
  );

  const handleCollapseGroups = React.useCallback(
    (parentId: number | null) => {
      const key = keyForParent(parentId);
      const state = groupListsRef.current[key];
      if (!state) return;
      setGroupLists((prev) => ({
        ...prev,
        [key]: {
          ...state,
          displayCount: Math.min(state.items.length, state.initialLimit),
        },
      }));
    },
    [keyForParent],
  );

  const handleGroupClick = React.useCallback(
    async (group: Group) => {
      rememberScroll();
      const res = await onPickGroup(group);
      if (res === false) {
        if (typeof activeGroupId === "number") {
          clearProjectPref(group.id, groupSearch.trim());
        }
        return;
      }
    },
    [rememberScroll, onPickGroup, activeGroupId, clearProjectPref, groupSearch],
  );

  const handleProjectClick = React.useCallback(
    (project: Project) => {
      rememberScroll();
      if (typeof activeGroupId === "number") {
        try {
          sessionStorage.setItem("ui_projects_leave_reason", "project");
          sessionStorage.setItem("ui_projects_keep_group", String(activeGroupId));
          sessionStorage.setItem("ui_projects_return_to_group", "0");
        } catch {}
      }
      onPickProject(project);
    },
    [activeGroupId, onPickProject, rememberScroll],
  );

  const handleLoadMoreProjects = React.useCallback(() => {
    if (typeof activeGroupId !== "number") return;
    if (!projectsState || projectsState.loading) return;
    const cachedAll = projectsState.allItems;
    if (cachedAll && cachedAll.length > currentProjects.length) {
      setProjectsMap((prev) => {
        const next = new Map(prev);
        const current = next.get(activeGroupId);
        if (!current) return prev;
        next.set(activeGroupId, {
          ...current,
          items: cachedAll,
          loading: false,
          error: undefined,
          nextPage: null,
          hasMore: false,
        });
        return next;
      });
      updateProjectPref(activeGroupId, groupSearch.trim(), true);
      return;
    }
    ensureProjects(activeGroupId, groupSearch.trim(), { mode: "all" });
  }, [activeGroupId, projectsState, currentProjects.length, ensureProjects, updateProjectPref, groupSearch]);

  const handleCollapseProjects = React.useCallback(() => {
    if (typeof activeGroupId !== "number") return;
    setProjectsMap((prev) => {
      const current = prev.get(activeGroupId);
      if (!current) return prev;
      const firstItems = current.firstPageItems || current.items.slice(0, PROJECTS_PAGE_SIZE);
      const firstNext = current.firstPageNext ?? current.nextPage ?? null;
      const next = new Map(prev);
      next.set(activeGroupId, {
        ...current,
        items: firstItems,
        nextPage: firstNext,
        hasMore: Boolean(firstNext) || Boolean(current.allItems && current.allItems.length > firstItems.length),
        loading: false,
        error: undefined,
      });
      return next;
    });
    updateProjectPref(activeGroupId, groupSearch.trim(), false);
  }, [activeGroupId, updateProjectPref, groupSearch]);

  const projectSelected = typeof selectedProjectId === "number" && selectedProjectId !== null;

  const renderSkeleton = React.useCallback(
    (count: number) => Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="h-9 rounded-xl bg-slate-100/80 animate-pulse" />
    )),
    [],
  );

  const showEllipsis = groupPath.length > 2;
  const visibleTrail = showEllipsis ? groupPath.slice(-2) : groupPath;

  const breadcrumbs = groupPath.length === 0 ? null : (
    <nav className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap overflow-hidden">
      <button
        type="button"
        onClick={async () => {
          rememberScroll();
          setGroupPath([]);
          if (onResetGroups) {
            onResetGroups();
          }
          projectPrefsRef.current.clear();
          persistProjectPrefs(projectPrefsRef.current);
          try {
            sessionStorage.removeItem("ui_projects_keep_group");
            sessionStorage.removeItem("ui_projects_return_to_group");
            sessionStorage.removeItem("ui_projects_leave_reason");
          } catch {}
        }}
        className={cls(
          "px-3 py-1.5 rounded-lg transition-all duration-200 font-medium",
          !groupPath.length 
            ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md" 
            : "text-slate-700 hover:bg-gradient-to-r hover:from-slate-100 hover:to-blue-50/50 hover:shadow-sm"
        )}
        aria-label={t('sidebar.root.back')}
        title={t('sidebar.root.back')}
      >
        {t('sidebar.root.label')}
      </button>
      {showEllipsis && (
        <>
          <ChevronRight size={14} className="text-slate-400" />
          <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-500 font-medium">…</span>
        </>
      )}
      {visibleTrail.map((entry, idx) => {
        const isLast = idx === visibleTrail.length - 1;
        return (
          <React.Fragment key={entry.id}>
            <ChevronRight size={14} className="text-slate-400" />
            <button
              type="button"
              onClick={() => handleGroupClick(entry)}
              className={cls(
                "px-3 py-1.5 rounded-lg transition-all duration-200 truncate max-w-[160px] font-medium",
                isLast 
                  ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md" 
                  : "text-slate-700 hover:bg-gradient-to-r hover:from-slate-100 hover:to-blue-50/50 hover:shadow-sm"
              )}
              title={entry.full_path}
            >
              {pathSegment(entry.full_path)}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );

  const nonSearchListState = currentListState ?? rootListState;
  const currentListLoading = isSearchMode
    ? searchLoading
    : !!(nonSearchListState?.loading && !(nonSearchListState.items.length));
  const currentListError = isSearchMode ? undefined : nonSearchListState?.error;
  const nonSearchItems = !isSearchMode && nonSearchListState
    ? nonSearchListState.items.slice(0, nonSearchListState.displayCount)
    : [];

  const hasMoreGroups = !isSearchMode && !!(nonSearchListState && (nonSearchListState.cursor || nonSearchListState.displayCount < nonSearchListState.items.length));
  const canCollapseGroups = !isSearchMode && !!(nonSearchListState && nonSearchListState.displayCount > nonSearchListState.initialLimit);

  const showEmptyGroups = !isSearchMode && !currentListLoading && nonSearchItems.length === 0;

  return (
    <aside
      ref={scrollRef}
      className="w-[420px] shrink-0 p-3 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden"
    >
      <div className="rounded-3xl border border-slate-300/70 bg-white shadow-lg shadow-slate-300/25 overflow-hidden backdrop-blur-sm">
        <div className="p-4 border-b border-slate-300/60 space-y-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="text-xs text-slate-600 uppercase tracking-wider font-semibold">{t('sidebar.navigation')}</div>
          <div className="relative">
            <input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder={t('sidebar.search.placeholder')}
              className="w-full gl-input text-sm pl-9 rounded-xl border-slate-200/60 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          {breadcrumbs}
        </div>
        <div className="p-3 space-y-4">
          {groupPathLoading && !currentGroup ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-slate-500 px-2">{t('sidebar.section.group')}</div>
              {renderSkeleton(1)}
            </div>
          ) : currentGroup ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-slate-500 px-2">{t('sidebar.section.group')}</div>
              <button
                type="button"
                onClick={() => handleGroupClick(currentGroup)}
                className={cls(
                  "w-full text-left px-3 py-2.5 rounded-xl border transition-all duration-200 flex items-center gap-2 focus:outline-none",
                  "hover:border-blue-200/60 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/30 hover:shadow-md",
                  !projectSelected && "border-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50/50 text-slate-900 shadow-lg ring-2 ring-blue-100",
                  projectSelected && "border-slate-200/60 bg-slate-50/50 text-slate-700",
                )}
                title={currentGroup.full_path}
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2.5 3.5h4l1 1H13a.5.5 0 01.5.5v6.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
                  </svg>
                </span>
                <span className={cls("truncate", !projectSelected ? "text-[15px] font-semibold text-slate-900" : "text-sm font-medium text-slate-700")}>{currentGroup.name || pathSegment(currentGroup.full_path)}</span>
              </button>
            </div>
          ) : groupPathError ? (
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-slate-500 px-2">{t('sidebar.section.group')}</div>
              <div className="text-xs text-rose-600 px-3 py-2">{groupPathError}</div>
            </div>
          ) : null}

          <div>
            {isSearchMode ? (
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-slate-500 px-2 mb-1 tracking-wide flex items-center gap-1">
                    <span>{t('sidebar.groups')}</span>
                  </div>
                  {searchLoading ? (
                    <div className="space-y-1">{renderSkeleton(4)}</div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-xs text-slate-500 px-3 py-2">{t('sidebar.not_found')}</div>
                  ) : (
                    <VirtualList
                      items={searchResults}
                      rowHeight={GROUP_ROW_HEIGHT}
                      overscan={4}
                      scrollRef={scrollRef}
                      className="space-y-1"
                      renderItem={(item) => {
                        const isActive = selectedGroupId === item.group.id;
                        const indent = Math.max(0, item.depth) * 16;
                        return (
                          <button
                            key={item.group.id}
                            type="button"
                            title={item.group.full_path}
                            onClick={() => handleGroupClick(item.group)}
                            className={cls(
                              "w-full text-left px-3 py-2 rounded-xl border transition-all duration-200 flex items-center gap-2",
                              isActive 
                                ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 border-blue-200/60 text-slate-900 shadow-lg ring-2 ring-blue-100" 
                                : "border-transparent hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/30 hover:border-slate-200/40 hover:shadow-md"
                            )}
                          >
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-slate-400 to-slate-600 text-white shadow-md"
                              style={{ marginLeft: indent }}
                            >
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M2.5 3.5h4l1 1H13a.5.5 0 01.5.5v6.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
                              </svg>
                            </span>
                            <div className={cls(
                              "truncate",
                              isActive ? "text-[15px] font-semibold text-slate-900" : "text-sm font-medium text-slate-700",
                            )}
                            >
                              {item.group.name || pathSegment(item.group.full_path)}
                            </div>
                          </button>
                        );
                      }}
                    />
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase text-slate-500 px-2 mb-1 tracking-wide flex items-center gap-1">
                    <span>{t('sidebar.projects')}</span>
                  </div>
                  {searchProjectLoading ? (
                    <div className="space-y-1">{renderSkeleton(PROJECTS_PAGE_SIZE)}</div>
                  ) : searchProjectError ? (
                    <div className="text-xs text-rose-600 px-3 py-2">{searchProjectError}</div>
                  ) : searchProjectResults.length === 0 ? (
                    <div className="text-xs text-slate-500 px-3 py-2">{t('sidebar.projects.not_found')}</div>
                  ) : (
                    <div className="space-y-1">
                      {searchProjectResults.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => handleProjectClick(project)}
                          className="w-full text-left px-3 py-2 rounded-xl border border-transparent transition-all duration-200 flex items-center gap-2 hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/30 hover:border-slate-200/40 hover:shadow-md"
                          title={project.path_with_namespace || project.name}
                        >
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M3 2.5h10a.5.5 0 01.5.5v10l-3-2-3 2-3-2-3 2V3a.5.5 0 01.5-.5z" />
                            </svg>
                          </span>
                          <div className="truncate text-sm font-medium text-slate-700">
                            {project.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="text-[11px] font-semibold uppercase text-slate-500 px-2 mb-1 tracking-wide flex items-center gap-1">
                  <span>{groupPath.length ? t('sidebar.subgroups') : t('sidebar.groups')}</span>
                </div>
                {currentListLoading ? (
                  <div className="space-y-1">{renderSkeleton(4)}</div>
                ) : currentListError ? (
                  <div className="text-xs text-rose-600 px-3 py-2">{currentListError}</div>
                ) : showEmptyGroups ? (
                  <div className="text-xs text-slate-500 px-3 py-2">{t('sidebar.no_children')}</div>
                ) : (
                  <VirtualList
                    items={nonSearchItems}
                    rowHeight={GROUP_ROW_HEIGHT}
                    overscan={4}
                    scrollRef={scrollRef}
                    className="space-y-1"
                    renderItem={(item) => {
                      const group = item.group;
                      const isActive = !projectSelected && selectedGroupId === group.id;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          title={group.full_path}
                          onClick={() => handleGroupClick(group)}
                          className={cls(
                            "w-full text-left px-3 py-2 rounded-xl border transition-all duration-200 flex items-center gap-2",
                            isActive 
                              ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 border-blue-200/60 text-slate-900 shadow-lg ring-2 ring-blue-100" 
                              : "border-transparent hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/30 hover:border-slate-200/40 hover:shadow-md"
                          )}
                        >
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M2.5 3.5h4l1 1H13a.5.5 0 01.5.5v6.5a.5.5 0 01-.5.5h-10a.5.5 0 01-.5-.5V4a.5.5 0 01.5-.5z" />
                            </svg>
                          </span>
                          <div className={cls(
                            "truncate",
                            isActive ? "text-[15px] font-semibold text-slate-900" : "text-sm font-medium text-slate-700",
                          )}
                          >
                            {group.name || pathSegment(group.full_path)}
                          </div>
                        </button>
                      );
                    }}
                  />
                )}
                {(hasMoreGroups || canCollapseGroups) && (
                  <div className="mt-2 flex flex-col gap-2">
                    {hasMoreGroups && (
                      <button
                        type="button"
                        onClick={() => handleShowMoreGroups(activeGroupId ?? null)}
                        className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl border border-slate-200/60 bg-gradient-to-r from-white to-slate-50 text-slate-700 hover:from-slate-50 hover:to-blue-50/30 hover:shadow-md transition-all duration-200"
                      >
                        <span className="text-sm font-medium">{t('sidebar.load.more')}</span>
                      </button>
                    )}
                    {canCollapseGroups && (
                      <button
                        type="button"
                        onClick={() => handleCollapseGroups(activeGroupId ?? null)}
                        className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl border border-slate-200/60 bg-gradient-to-r from-white to-slate-50 text-slate-700 hover:from-slate-50 hover:to-blue-50/30 hover:shadow-md transition-all duration-200"
                      >
                        <span className="text-sm font-medium">{t('sidebar.collapse')}</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {typeof activeGroupId === "number" && (
            <div>
              <div className="border-t border-slate-300/60 pt-3 mt-3">
                <div className="text-[11px] font-semibold uppercase text-slate-600 px-2 mb-1 tracking-wide flex items-center gap-1">
                  <span>{t('sidebar.projects')}</span>
                </div>
              </div>
              {projectsError && !projectsLoading && currentProjects.length === 0 ? (
                <div className="text-xs text-rose-600 px-3 py-2">{projectsError}</div>
              ) : projectsLoading && currentProjects.length === 0 ? (
                <div className="space-y-1">{renderSkeleton(PROJECTS_PAGE_SIZE)}</div>
              ) : currentProjects.length === 0 ? (
                <div className="text-xs text-slate-500 px-3 py-2">{groupSearch.trim() ? t('sidebar.not_found') : t('sidebar.projects.none')}</div>
              ) : (
                <div className="space-y-1">
                  {currentProjects.map((project) => {
                    const isSelected = selectedProjectId === project.id;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => handleProjectClick(project)}
                        className={cls(
                          "w-full text-left px-3 py-2 rounded-xl border transition-all duration-200 flex items-center gap-2",
                          isSelected 
                            ? "bg-gradient-to-r from-blue-50 to-indigo-50/50 border-blue-200/60 text-slate-900 shadow-lg ring-2 ring-blue-100" 
                            : "border-transparent hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/30 hover:border-slate-200/40 hover:shadow-md"
                        )}
                        title={project.path_with_namespace || project.name}
                      >
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M3 2.5h10a.5.5 0 01.5.5v10l-3-2-3 2-3-2-3 2V3a.5.5 0 01.5-.5z" />
                          </svg>
                        </span>
                        <div className={cls(
                          "truncate",
                          isSelected ? "text-[15px] font-semibold text-slate-900" : "text-sm font-medium text-slate-700",
                        )}
                        >
                          {project.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {(projectsState?.hasMore || projectsState?.allItems) && (
                <div className="mt-2 flex flex-col gap-2">
                  {projectsState?.hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMoreProjects}
                      disabled={projectsLoading}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200/60 bg-gradient-to-r from-white to-slate-50 text-slate-700 hover:from-slate-50 hover:to-blue-50/30 hover:shadow-md transition-all duration-200 disabled:opacity-60"
                    >
                      {projectsLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                      <span className="text-sm font-medium">{t('sidebar.load.more')}</span>
                    </button>
                  )}
                  {projectsState && currentProjects.length > (projectsState.firstPageItems?.length ?? PROJECTS_PAGE_SIZE) && (
                    <button
                      type="button"
                      onClick={handleCollapseProjects}
                      disabled={projectsLoading}
                      className="w-full inline-flex items-center justify-center px-3 py-2 rounded-xl border border-slate-200/60 bg-gradient-to-r from-white to-slate-50 text-slate-700 hover:from-slate-50 hover:to-blue-50/30 hover:shadow-md transition-all duration-200 disabled:opacity-60"
                    >
                      <span className="text-sm font-medium">{t('sidebar.collapse')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
