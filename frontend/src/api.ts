import type { ApiError, Group, Health, Project, UIConfig, VarDetail, VarSummary } from "./types";

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
  async uiConfig() {
    const r = await fetchNoStore("/api/ui-config");
    return check<UIConfig>(r);
  },
  async stats() {
    const r = await fetchNoStore("/api/stats");
    return check<{ groups_count: number; projects_count: number; projects_sample: Project[] }>(r);
  },
  async groups(search = "") {
    const r = await fetchNoStore("/api/groups" + (search ? `?search=${encodeURIComponent(search)}` : ""));
    return check<Group[]>(r);
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
  async projectGet(project_id: number) {
    const r = await fetchNoStore(`/api/projects/${project_id}`);
    return check<Project>(r);
  },
  async projectBundle(project_id: number) {
    const r = await fetchNoStore(`/api/projects/${project_id}/bundle`);
    return check<{ project: Project; variables: VarSummary[]; environments: string[] }>(r);
  },
  async projectsLimited(group_id: number, search: string, limit: number) {
    const qs = new URLSearchParams();
    if (group_id) qs.set("group_id", String(group_id));
    if (search) qs.set("search", search);
    if (limit) qs.set("limit", String(limit));
    const r = await fetchNoStore("/api/projects?" + qs.toString());
    return check<Project[]>(r);
  }
};
