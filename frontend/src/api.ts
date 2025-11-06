import type {
  ApiError,
  DeleteVarResponse,
  GroupPageResponse,
  GroupTreeNode,
  GroupTreeResponse,
  Health,
  Project,
  ProjectListPage,
  VarDetail,
  VarSummary,
} from "./types";

function fetchNoStore(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input as any, { ...(init || {}), cache: 'no-store' });
}

async function check<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let message = "";
    let parsed: any = undefined;
    try {
      const txt = await r.text();
      message = txt;
      try { parsed = JSON.parse(txt); } catch {}
    } catch {}
    const err: ApiError = { status: r.status, message, json: parsed };
    throw err;
  }
  return r.json() as Promise<T>;
}

export const api = {
  async health() {
    const r = await fetchNoStore("/api/health");
    return check<Health>(r);
  },
  async stats() {
    const r = await fetchNoStore("/api/stats");
    return check<{ groups_count: number; projects_count: number; projects_sample: Project[] }>(r);
  },
  async groups(params: { search?: string; hash?: string; since?: string } = {}) {
    const { search = "", hash, since } = params;
    const headers: Record<string, string> = {};
    if (since) headers["If-Modified-Since"] = since;
    if (hash) headers["X-Tree-Hash"] = hash;
    const url = "/api/groups" + (search ? `?search=${encodeURIComponent(search)}` : "");
    const r = await fetchNoStore(url, { headers });
    const data = await check<GroupTreeResponse>(r);
    const lastModifiedHeader = r.headers.get("Last-Modified") || undefined;
    const hashHeader = r.headers.get("X-Tree-Hash") || undefined;
    return {
      ...data,
      hash: hashHeader || data.hash,
      last_modified_http: data.last_modified_http || lastModifiedHeader,
    };
  },
  async groupsRootPage(params: { cursor?: string | null; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit) qs.set("limit", String(params.limit));
    const url = `/api/groups/root${qs.size ? `?${qs.toString()}` : ""}`;
    const r = await fetchNoStore(url);
    const data = await check<GroupPageResponse>(r);
    const lastModifiedHeader = r.headers.get("Last-Modified") || undefined;
    const hashHeader = r.headers.get("X-Tree-Hash") || undefined;
    return {
      ...data,
      hash: hashHeader || data.hash,
      last_modified_http: data.last_modified_http || lastModifiedHeader,
    } satisfies GroupPageResponse;
  },
  async groupChildrenPage(groupId: number, params: { cursor?: string | null; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.limit) qs.set("limit", String(params.limit));
    const url = `/api/groups/${groupId}/children${qs.size ? `?${qs.toString()}` : ""}`;
    const r = await fetchNoStore(url);
    const data = await check<GroupPageResponse>(r);
    const lastModifiedHeader = r.headers.get("Last-Modified") || undefined;
    const hashHeader = r.headers.get("X-Tree-Hash") || undefined;
    return {
      ...data,
      hash: hashHeader || data.hash,
      last_modified_http: data.last_modified_http || lastModifiedHeader,
    } satisfies GroupPageResponse;
  },
  async groupPath(groupId: number) {
    const r = await fetchNoStore(`/api/groups/${groupId}/path`);
    return check<Array<{ id: number; name?: string; full_path?: string; parent_id?: number | null; children_count?: number }>>(r);
  },
  async projects(group_id: number | null, search = "") {
    const qs = new URLSearchParams();
    if (group_id) qs.set("group_id", String(group_id));
    if (search) qs.set("search", search);
    const r = await fetchNoStore("/api/projects?" + qs.toString());
    return check<Project[]>(r);
  },
  async projectEnvs(project_id: number) {
    const r = await fetchNoStore(`/api/projects/${project_id}/environments`);
    if (!r.ok) return []; // без падения UI
    const data = await r.json();
    return (data?.environments as string[]) || [];
  },
  async vars(ctx: { kind: "project" | "group"; id: number }) {
    const url = ctx.kind === "project" ? `/api/projects/${ctx.id}/variables` : `/api/groups/${ctx.id}/variables`;
    const r = await fetchNoStore(url);
    return check<VarSummary[]>(r);
  },
  async varGet(ctx: { kind: "project" | "group"; id: number }, key: string, env: string) {
    const url =
      ctx.kind === "project"
        ? `/api/projects/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`
        : `/api/groups/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`;
    const r = await fetchNoStore(url);
    return check<VarDetail>(r);
  },
  async upsert(ctx: { kind: "project" | "group"; id: number }, payload: any) {
    const path =
      ctx.kind === "project"
        ? `/api/projects/${ctx.id}/variables/upsert`
        : `/api/groups/${ctx.id}/variables/upsert`;
    const r = await fetchNoStore(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return check<any>(r);
  },
  async varDelete(ctx: { kind: "project" | "group"; id: number }, key: string, env: string) {
    const url =
      ctx.kind === "project"
        ? `/api/projects/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`
        : `/api/groups/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`;
    const r = await fetchNoStore(url, {
      method: "DELETE",
    });
    return check<DeleteVarResponse>(r);
  },
  async projectGet(project_id: number) {
    const r = await fetchNoStore(`/api/projects/${project_id}`);
    return check<Project>(r);
  },
  async projectBundle(project_id: number) {
    const r = await fetchNoStore(`/api/projects/${project_id}/bundle`);
    return check<{ project: Project; variables: VarSummary[]; environments: string[] }>(r);
  },
  async projectsPage(params: { groupId: number; search: string; page: number; perPage: number }) {
    const { groupId, search, page, perPage } = params;
    const qs = new URLSearchParams();
    if (groupId) qs.set("group_id", String(groupId));
    if (search) qs.set("search", search);
    qs.set("page", String(page));
    qs.set("per_page", String(perPage));
    const r = await fetchNoStore("/api/projects?" + qs.toString());
    return check<ProjectListPage>(r);
  }
};
