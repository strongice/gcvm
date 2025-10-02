import type { GroupTreeNode } from "../types";

const STORAGE_KEY = "ui_group_tree_cache_v1";
const GROUP_CACHE_TTL_MS = 60_000;

type GroupTreeCacheRecord = {
  tree: GroupTreeNode[];
  hash: string;
  lastModified: string;
  lastModifiedHttp?: string;
  storedAt: number;
};

function cloneTree<T>(value: T): T {
  const cloner = (globalThis as any).structuredClone;
  if (typeof cloner === "function") {
    return cloner(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function loadGroupTreeCache(): { record?: GroupTreeCacheRecord; stale: boolean } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { stale: true };
    }
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tree)) {
      return { stale: true };
    }
    const record: GroupTreeCacheRecord = {
      tree: data.tree as GroupTreeNode[],
      hash: String(data.hash || ""),
      lastModified: String(data.lastModified || ""),
      lastModifiedHttp: data.lastModifiedHttp ? String(data.lastModifiedHttp) : undefined,
      storedAt: Number(data.storedAt || Date.now()),
    };
    const stale = Date.now() - record.storedAt > GROUP_CACHE_TTL_MS;
    return { record, stale };
  } catch {
    return { stale: true };
  }
}

export function saveGroupTreeCache(record: GroupTreeCacheRecord): void {
  try {
    const payload = JSON.stringify({
      tree: record.tree,
      hash: record.hash,
      lastModified: record.lastModified,
      lastModifiedHttp: record.lastModifiedHttp,
      storedAt: record.storedAt,
    });
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
}

export function filterGroupTree(tree: GroupTreeNode[], query: string): GroupTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return cloneTree(tree);
  }
  const cloned = cloneTree(tree);

  const matchNode = (node: GroupTreeNode): boolean => {
    const name = node.group.name?.toLowerCase() || "";
    const path = node.group.full_path?.toLowerCase() || "";
    const selfMatch = name.includes(normalized) || path.includes(normalized);
    const children: GroupTreeNode[] = [];
    for (const child of node.children || []) {
      if (matchNode(child)) {
        children.push(child);
      }
    }
    node.children = children;
    return selfMatch || children.length > 0;
  };

  return cloned.filter(matchNode);
}

export type { GroupTreeCacheRecord };
