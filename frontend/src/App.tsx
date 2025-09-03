import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { Group, Project, VarEditing, VarSummary } from "./types";
import { Sidebar } from "./components/Sidebar";
import { VariablesTable } from "./components/VariablesTable";
import { VariableModal } from "./components/VariableModal";

/* утилита классов */
function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export default function App() {
  const [tokenInfo, setTokenInfo] = useState<string>("…");
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(15);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");

  const [ctx, setCtx] = useState<{ kind: "group" | "project"; id: number; name: string; parent?: { id: number; name: string } } | null>(null);

  const [vars, setVars] = useState<VarSummary[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [varsError, setVarsError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<VarEditing | null>(null);
  const [envOptions, setEnvOptions] = useState<string[]>([]);

  const selectedProjectId = ctx?.kind === "project" ? ctx.id : null;

  // init
  useEffect(() => {
    (async () => {
      const h = await api.health();
      const name = h?.user?.name || h?.user?.username || "OK";
      setTokenInfo(name);

      const cfg = await api.uiConfig();
      setAutoRefreshEnabled(!!cfg?.auto_refresh_enabled);
      setAutoRefreshSec(Number(cfg?.auto_refresh_sec || 15));

      setGroups(await api.groups());
    })();
  }, []);

  // автообновление
  useEffect(() => {
    if (!autoRefreshEnabled || !ctx) return;
    const t = setInterval(() => loadVars(ctx, true), Math.max(1, autoRefreshSec) * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshEnabled, autoRefreshSec, ctx]);

  async function loadVars(c: { kind: "group" | "project"; id: number; name: string }, silent = false) {
    setVarsLoading(!silent);
    try {
      const v = await api.vars(c);
      setVars(v);
      setVarsError(null);
    } catch (e: any) {
      const status: number = e?.status ?? 0;
      if (status === 403) {
        setVars([]);
        setVarsError("Нет доступа к переменным для выбранного контекста.");
      } else if (status === 404) {
        setVars([]);
        setVarsError("Контекст не найден. Выберите группу/проект заново.");
        setCtx(null);
      } else {
        setVars([]);
        setVarsError("Не удалось загрузить переменные.");
      }
    } finally {
      setVarsLoading(false);
    }
  }

  // выборы
  async function pickGroup(g: Group) {
    const c = { kind: "group" as const, id: g.id, name: g.full_path };
    setCtx(c);
    setProjects(await api.projects(g.id, projectSearch));
    await loadVars(c, true);
  }

  async function pickProject(p: Project) {
    const c = {
      kind: "project" as const,
      id: p.id,
      name: p.name,
      parent: ctx?.kind === "group" ? { id: ctx.id, name: ctx.name } : undefined,
    };
    setCtx(c);
    await loadVars(c);
  }

  // модалка
  async function openCreate() {
    if (!ctx) return;
    const empty: VarEditing = { key: "", environment_scope: "*", protected: false, masked: false, raw: false, value: "" };
    setModalInitial(empty);
    setModalOpen(true);
    if (ctx.kind === "project") setEnvOptions(await api.projectEnvs(ctx.id));
    else setEnvOptions([]);
  }

  async function openEdit(v: VarSummary) {
    if (!ctx) return;
    try {
      const full = await api.varGet(ctx, v.key, v.environment_scope || "*");
      const edit: VarEditing = { ...full, __originalKey: full.key, __originalEnv: full.environment_scope || "*" };
      setModalInitial(edit);
      setModalOpen(true);
      if (ctx.kind === "project") setEnvOptions(await api.projectEnvs(ctx.id));
      else setEnvOptions([]);
    } catch {
      await loadVars(ctx);
    }
  }

  async function saveEditing(draft: VarEditing) {
    if (!ctx) return;
    const payload: any = {
      key: draft.key.trim(),
      environment_scope: draft.environment_scope?.trim() || "*",
      protected: !!draft.protected,
      // masked управляется видимостью:
      masked: !!draft.masked || !!draft.hidden,
      raw: !!draft.raw, // expand = !raw
      value: draft.value ?? "",
    };

    // GitLab 17.4: создание Hidden — через masked_and_hidden=true
    // (на update менять на hidden нельзя — бэкенд обработает как recreate при необходимости)
    if (draft.hidden) {
      payload.masked_and_hidden = true;
    }

    if (draft.__originalKey) {
      payload.original_key = draft.__originalKey;
      payload.original_environment_scope = draft.__originalEnv || "*";
    }

    await api.upsert(ctx, payload);
    await loadVars(ctx);
  }

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
        <Sidebar
          groups={groups}
          groupSearch={groupSearch}
          onGroupSearchChange={async (q) => {
            setGroupSearch(q);
            setGroups(await api.groups(q));
          }}
          onPickGroup={pickGroup}
          projects={projects}
          projectSearch={projectSearch}
          onProjectSearchChange={async (q) => {
            setProjectSearch(q);
            const gid = ctx?.kind === "group" ? ctx.id : ctx?.parent?.id || null;
            setProjects(await api.projects(gid as any, q));
          }}
          onPickProject={pickProject}
          selectedProjectId={selectedProjectId}
          currentGroupName={ctx?.kind === "group" ? ctx.name : ctx?.parent?.name}
        />

        <VariablesTable
          vars={vars}
          loading={varsLoading}
          error={varsError}
          onEdit={openEdit}
          hasContext={!!ctx}
          titleText={ctx ? (ctx.kind === "project" ? "Проект: " : "Группа: ") + ctx.name : "Выберите контекст"}
        />
      </main>

      <VariableModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={modalInitial}
        envOptions={envOptions}
        onSave={saveEditing}
      />
    </div>
  );
}

