import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { Group, Project, VarEditing, VarSummary } from "./types";
import { Sidebar } from "./components/Sidebar";
import { VariablesTable } from "./components/VariablesTable";
import { VariableModal } from "./components/VariableModal";
import SettingsModal from "./components/SettingsModal";
import { Menu, Plus, Settings as Gear } from "lucide-react";

/* утилита классов */
function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export default function App() {
  const [tokenInfo, setTokenInfo] = useState<string>("…");
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(15);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

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

  const [settingsOpen, setSettingsOpen] = useState(false);

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
        setVarsError("Нет доступа к переменным для выбранной группы.");
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
    const empty: VarEditing = { key: "", variable_type: 'file', environment_scope: "*", protected: false, masked: false, raw: false, value: "" };
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
      variable_type: draft.variable_type || 'file',
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

  const handleSettingsSave = (refreshSec: number) => {
    setAutoRefreshSec(refreshSec);
    // TODO: отправить на сервер, если нужно
  };

  const selectedProjectId = ctx?.kind === "project" ? ctx.id : null;

  // --- Сохранение состояния в localStorage ---
  useEffect(() => {
    // Сохраняем выбранный контекст
    if (ctx) {
      localStorage.setItem("ui_ctx", JSON.stringify(ctx));
    }
    // Сохраняем открытый редактор переменной
    if (modalOpen && modalInitial) {
      localStorage.setItem("ui_var_edit", JSON.stringify(modalInitial));
    } else {
      localStorage.removeItem("ui_var_edit");
    }
  }, [ctx, modalOpen, modalInitial]);

  useEffect(() => {
    // Восстанавливаем выбранный контекст и редактор переменной только если не было очистки (например, при смене гитлаба)
    const savedCtx = localStorage.getItem("ui_ctx");
    const savedVar = localStorage.getItem("ui_var_edit");
    if (savedCtx) {
      try {
        const parsed = JSON.parse(savedCtx);
        // Если проект без parent — получаем его через API
        if (parsed.kind === "project" && !parsed.parent?.id) {
          api.projectGet(parsed.id).then(proj => {
            // Если есть id namespace (group) — ищем её среди загруженных групп
            const groupId = proj.namespace_id || undefined;
            if (groupId) {
              api.groups().then(allGroups => {
                const parentGroup = allGroups.find(g => g.id === groupId);
                if (parentGroup) {
                  const newCtx = { ...parsed, parent: { id: parentGroup.id, name: parentGroup.full_path } };
                  setCtx(newCtx);
                  api.projects(parentGroup.id, projectSearch).then(setProjects);
                  loadVars(newCtx, true);
                  return;
                }
              });
            }
            // Если не удалось найти группу — отображаем только проект
            setCtx(parsed);
            setProjects([{ id: parsed.id, name: parsed.name, path_with_namespace: parsed.name }]);
            loadVars(parsed, true);
          });
        } else if (parsed.kind === "group") {
          setCtx(parsed);
          api.projects(parsed.id, projectSearch).then(setProjects);
          loadVars(parsed, true);
        } else if (parsed.kind === "project") {
          // Если parent есть — стандартная логика
          setCtx(parsed);
          api.projects(parsed.parent.id, projectSearch).then(setProjects);
          loadVars(parsed, true);
        }
      } catch {}
    }
    if (savedVar) {
      try {
        const parsed = JSON.parse(savedVar);
        setModalInitial(parsed);
        setModalOpen(true);
      } catch {}
    }
  }, []);

  useEffect(() => {
    // Очищаем localStorage только если меняется base_url гитлаба
    const prevBaseUrl = localStorage.getItem("ui_gitlab_url");
    const baseUrl = window.location.origin;
    if (prevBaseUrl && prevBaseUrl !== baseUrl) {
      localStorage.removeItem("ui_ctx");
      localStorage.removeItem("ui_var_edit");
    }
    localStorage.setItem("ui_gitlab_url", baseUrl);
  }, []);

  useEffect(() => {
    // Если редактор открыт после восстановления, подгружаем envOptions и актуальные данные переменной
    if (modalOpen && modalInitial && ctx) {
      if (ctx.kind === "project") {
        api.projectEnvs(ctx.id).then(setEnvOptions);
      } else {
        setEnvOptions([]);
      }
      // Если есть ключ и окружение — обновим данные переменной
      if (modalInitial.key) {
        api.varGet(ctx, modalInitial.key, modalInitial.environment_scope || "*")
          .then(full => {
            setModalInitial({ ...full, __originalKey: full.key, __originalEnv: full.environment_scope || "*" });
          })
          .catch(() => {});
      }
    }
  }, [modalOpen, modalInitial, ctx]);

  return (
    <div className="min-h-screen text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3">
          <button className="lg:hidden p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню">
            <Menu size={18} />
          </button>
          <div className="text-[15px] font-semibold tracking-wide">GitLab: CI/CD Variables</div>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-2 py-1 text-xs rounded-full border border-emerald-300/70 bg-emerald-50 text-emerald-700">
              Token OK: {tokenInfo}
            </span>
            <button
              className={cls(
                "hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm border",
                ctx ? "border-slate-200 bg-white hover:bg-slate-50" : "border-slate-200 text-slate-400 cursor-not-allowed"
              )}
              onClick={openCreate}
              disabled={!ctx}
            >
              <Plus size={16} /> Создать
            </button>
            <button
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Gear size={16} /> Настройки
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto flex">
        {/* Sidebar Desktop */}
        <div className="hidden lg:block">
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
        </div>

        {/* Sidebar Mobile Drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[86vw] max-w-[360px] bg-white border-r border-slate-200 p-2 overflow-auto">
              <Sidebar
                groups={groups}
                groupSearch={groupSearch}
                onGroupSearchChange={async (q) => {
                  setGroupSearch(q);
                  setGroups(await api.groups(q));
                }}
                onPickGroup={(g) => { setSidebarOpen(false); pickGroup(g); }}
                projects={projects}
                projectSearch={projectSearch}
                onProjectSearchChange={async (q) => {
                  setProjectSearch(q);
                  const gid = ctx?.kind === "group" ? ctx.id : ctx?.parent?.id || null;
                  setProjects(await api.projects(gid as any, q));
                }}
                onPickProject={(p) => { setSidebarOpen(false); pickProject(p); }}
                selectedProjectId={selectedProjectId}
                currentGroupName={ctx?.kind === "group" ? ctx.name : ctx?.parent?.name}
              />
            </div>
          </div>
        )}

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

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
        currentValue={autoRefreshSec}
      />
    </div>
  );
}
