import React, { useEffect, useRef, useState } from "react";

/* ---------------- API ---------------- */

type Group = { id: number; full_path: string };
type Project = { id: number; name: string; path_with_namespace?: string; namespace?: string };
type VarSummary = {
  key: string;
  environment_scope: string;
  protected: boolean;
  masked: boolean;
  raw: boolean; // expand = !raw
};
type VarDetail = VarSummary & { value: string };

const api = {
  async uiConfig() {
    const r = await fetch("/api/ui-config");
    return r.json();
  },
  async health() {
    const r = await fetch("/api/health");
    return r.json();
  },
  async groups(search = ""): Promise<Group[]> {
    const r = await fetch("/api/groups" + (search ? `?search=${encodeURIComponent(search)}` : ""));
    return r.json();
  },
  async projects(group_id: number | null, search = ""): Promise<Project[]> {
    const qs = new URLSearchParams();
    if (group_id) qs.set("group_id", String(group_id));
    if (search) qs.set("search", search);
    const r = await fetch("/api/projects?" + qs.toString());
    return r.json();
  },
  async vars(ctx: { kind: "project" | "group"; id: number }): Promise<VarSummary[]> {
    const url = ctx.kind === "project" ? `/api/projects/${ctx.id}/variables` : `/api/groups/${ctx.id}/variables`;
    const r = await fetch(url);
    return r.json();
  },
  async varGet(
    ctx: { kind: "project" | "group"; id: number },
    key: string,
    env: string
  ): Promise<VarDetail> {
    const path =
      ctx.kind === "project"
        ? `/api/projects/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`
        : `/api/groups/${ctx.id}/variables/${encodeURIComponent(key)}?environment_scope=${encodeURIComponent(env)}`;
    const r = await fetch(path);
    return r.json();
  },
  async upsert(
    ctx: { kind: "project" | "group"; id: number },
    payload: any
  ): Promise<any> {
    const path =
      ctx.kind === "project"
        ? `/api/projects/${ctx.id}/variables/upsert`
        : `/api/groups/${ctx.id}/variables/upsert`;
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
};

/* ---------------- helpers ---------------- */

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- App ---------------- */

export default function App() {
  const [tokenInfo, setTokenInfo] = useState<string>("…");
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(15);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  const [ctx, setCtx] = useState<{ kind: "group" | "project"; id: number; name: string; parent?: { id: number; name: string } } | null>(
    null
  );
  const [vars, setVars] = useState<VarSummary[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VarDetail | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const selectedProjectId = ctx?.kind === "project" ? ctx.id : null;

  // init
  useEffect(() => {
    (async () => {
      try {
        const h = await api.health();
        setTokenInfo(h?.user?.name || h?.user?.username || "OK");
      } catch {
        setTokenInfo("error");
      }
      const cfg = await api.uiConfig();
      setAutoRefreshEnabled(!!cfg?.auto_refresh_enabled);
      setAutoRefreshSec(Number(cfg?.auto_refresh_sec || 15));
      setGroups(await api.groups());
      // restore last context
      const raw = localStorage.getItem("lastCtx");
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (saved?.kind === "group") {
            setCtx(saved);
            setProjects(await api.projects(saved.id, ""));
            loadVars(saved);
          } else if (saved?.kind === "project") {
            setCtx(saved);
            if (saved.parent?.id) {
              setProjects(await api.projects(saved.parent.id, ""));
            } else {
              setProjects(await api.projects(null, ""));
            }
            loadVars(saved);
          }
        } catch {}
      }
    })();
  }, []);

  // auto refresh
  useEffect(() => {
    if (!autoRefreshEnabled || !ctx) return;
    const t = setInterval(() => loadVars(ctx), Math.max(1, autoRefreshSec) * 1000);
    return () => clearInterval(t);
  }, [autoRefreshEnabled, autoRefreshSec, ctx]);

  async function loadVars(c: { kind: "group" | "project"; id: number; name: string }) {
    setVarsLoading(true);
    try {
      const v = await api.vars(c);
      setVars(v);
    } finally {
      setVarsLoading(false);
    }
  }

  async function pickGroup(g: Group) {
    const c = { kind: "group" as const, id: g.id, name: g.full_path };
    setCtx(c);
    localStorage.setItem("lastCtx", JSON.stringify(c));
    setProjects(await api.projects(g.id, projectSearch));
    loadVars(c);
  }

  async function pickProject(p: Project) {
    const c = {
      kind: "project" as const,
      id: p.id,
      name: p.name, // показываем только имя
      parent: ctx?.kind === "group" ? { id: ctx.id, name: ctx.name } : undefined,
    };
    setCtx(c);
    localStorage.setItem("lastCtx", JSON.stringify(c));
    loadVars(c);
  }

  function openCreate() {
    if (!ctx) return;
    const empty: VarDetail = {
      key: "",
      environment_scope: "*",
      protected: false,
      masked: false,
      raw: false,
      value: "",
    };
    setEditing(empty);
    setEditorValue("");
    setModalOpen(true);
  }

  async function openEdit(v: VarSummary) {
    if (!ctx) return;
    const full = await api.varGet(ctx, v.key, v.environment_scope || "*");
    // запомним оригинальные значения для rename
    (full as any).__originalKey = full.key;
    (full as any).__originalEnv = full.environment_scope || "*";
    setEditing(full);
    setEditorValue(full.value || "");
    setModalOpen(true);
  }

  async function saveVar() {
    if (!ctx || !editing) return;
    const payload: any = {
      key: editing.key.trim(),
      environment_scope: editing.environment_scope?.trim() || "*",
      protected: !!editing.protected,
      masked: !!editing.masked,
      raw: !!editing.raw, // expand = !raw
      value: editorValue,
    };
    if ((editing as any).__originalKey) {
      payload.original_key = (editing as any).__originalKey;
      payload.original_environment_scope = (editing as any).__originalEnv || "*";
    }
    await api.upsert(ctx, payload);
    setModalOpen(false);
    await loadVars(ctx);
  }

  /* ---------- UI ---------- */

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center gap-3">
          <div className="text-[15px] font-semibold">GitLab: CI/CD Variables</div>
          <span className="ml-auto px-2 py-1 text-xs rounded-full border border-emerald-300/70 bg-emerald-50 text-emerald-700">
            Token OK: {tokenInfo}
          </span>
          <button
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm"
            onClick={() => ctx && loadVars(ctx)}
          >
            Обновить
          </button>
          <button
            className={cls(
              "px-3 py-1.5 rounded-xl border text-sm",
              ctx ? "border-slate-200 bg-white hover:bg-slate-50" : "border-slate-200 text-slate-400 cursor-not-allowed"
            )}
            onClick={openCreate}
            disabled={!ctx}
          >
            Создать
          </button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto flex">
        {/* Sidebar */}
        <aside className="w-[320px] shrink-0 p-4">
          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="text-xs text-slate-500 mb-1">Группы</div>
              <input
                value={groupSearch}
                onChange={async (e) => {
                  const q = e.target.value;
                  setGroupSearch(q);
                  setGroups(await api.groups(q));
                }}
                placeholder="Поиск групп"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>

            <div className="max-h-[32vh] overflow-auto p-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => pickGroup(g)}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50"
                >
                  {g.full_path}
                </button>
              ))}
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="text-xs text-slate-500 mb-1">
                Проекты{ctx?.kind === "group" ? ` для: ${ctx.name}` : ""}
              </div>
              <input
                value={projectSearch}
                onChange={async (e) => {
                  const q = e.target.value;
                  setProjectSearch(q);
                  const gid = ctx?.kind === "group" ? ctx.id : ctx?.parent?.id || null;
                  setProjects(await api.projects(gid as any, q));
                }}
                placeholder="Поиск проектов"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              />
            </div>

            <div className="max-h-[40vh] overflow-auto p-2 pt-0">
              {projects.map((p) => {
                const selected = selectedProjectId === p.id;
                return (
                  <button
                    key={p.id}
                    title={p.path_with_namespace || p.name}
                    onClick={() => pickProject(p)}
                    className={cls(
                      "w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50",
                      selected && "bg-slate-100 border border-slate-200"
                    )}
                  >
                    <span className="block truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Table */}
        <section className="flex-1 p-4">
          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <div className="text-base font-semibold">
                {ctx ? (ctx.kind === "project" ? "Проект: " : "Группа: ") + ctx.name : "Выберите контекст"}
              </div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-slate-600 [&>th]:border-b [&>th]:border-slate-200">
                    <th>КЛЮЧ</th>
                    <th>ОКРУЖЕНИЕ</th>
                    <th>ЗАЩИЩЁННАЯ</th>
                    <th>МАСКИРОВАННАЯ</th>
                    <th>EXPAND</th>
                    <th>ДЕЙСТВИЯ</th>
                  </tr>
                </thead>
                <tbody>
                  {varsLoading ? (
                    <tr>
                      <td className="py-8 text-center text-slate-500" colSpan={6}>
                        Загрузка…
                      </td>
                    </tr>
                  ) : vars.length === 0 ? (
                    <tr>
                      <td className="py-8 text-center text-slate-500" colSpan={6}>
                        Нет file-переменных
                      </td>
                    </tr>
                  ) : (
                    vars.map((v) => {
                      const expand = !(v.raw === true);
                      return (
                        <tr
                          key={`${v.key}|${v.environment_scope}`}
                          className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-slate-100"
                        >
                          <td className="font-mono text-[12px]">{v.key}</td>
                          <td>{v.environment_scope || "*"}</td>
                          <td>{v.protected ? "✓" : ""}</td>
                          <td>{v.masked ? "✓" : ""}</td>
                          <td>{expand ? "✓" : ""}</td>
                          <td>
                            <button
                              className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                              onClick={() => openEdit(v)}
                            >
                              Редактировать
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/35" onClick={() => setModalOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="max-w-[1100px] w-[95vw] max-h-[88vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="text-lg font-semibold">
                  {editing?.key ? `Редактирование ${editing.key}` : "Создание переменной"}
                </div>
                <button
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                  onClick={() => setModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              {/* form */}
              <div className="p-5 overflow-auto flex-1 min-w-0">
                {editing && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2">
                        <span className="text-slate-600 w-20">Key</span>
                        <input
                          value={editing.key}
                          onChange={(e) => setEditing({ ...editing, key: e.target.value })}
                          className="w-[360px] max-w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                          placeholder="KEY"
                        />
                      </label>

                      <label className="inline-flex items-center gap-2">
                        <span className="text-slate-600">Environment</span>
                        <input
                          value={editing.environment_scope}
                          onChange={(e) => setEditing({ ...editing, environment_scope: e.target.value || "*" })}
                          className="w-[180px] px-3 py-2 rounded-xl border border-slate-300 bg-white"
                          placeholder="*"
                        />
                      </label>

                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editing.protected}
                          onChange={(e) => setEditing({ ...editing, protected: e.target.checked })}
                        />
                        Protect variable
                      </label>

                      <label className="inline-flex items-center gap-2" title="raw=false when checked">
                        <input
                          type="checkbox"
                          checked={!(editing.raw === true)}
                          onChange={(e) => setEditing({ ...editing, raw: !e.target.checked })}
                        />
                        Expand variable reference
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">Visibility:</span>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name="vis"
                            checked={!editing.masked}
                            onChange={() => setEditing({ ...editing, masked: false })}
                          />
                          Visible
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name="vis"
                            checked={editing.masked}
                            onChange={() => setEditing({ ...editing, masked: true })}
                          />
                          Masked
                        </label>
                        <label className="inline-flex items-center gap-1 opacity-60" title="Same as Masked in API">
                          <input type="radio" name="vis" disabled />
                          Masked and hidden
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm text-slate-600">Value</div>
                      <textarea
                        value={editorValue}
                        onChange={(e) => setEditorValue(e.target.value)}
                        className="w-full max-w-full h-[48vh] min-h-[220px] rounded-2xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-300/60 overflow-auto resize-y"
                        style={{ maxWidth: "100%" }}
                        placeholder=".env / file content"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
                <div className="flex gap-2 justify-end">
                  <button
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                    onClick={() => setModalOpen(false)}
                  >
                    Отмена
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                    onClick={saveVar}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


