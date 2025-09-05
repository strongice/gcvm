import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../reset.css';
import { api } from '../api';
import type { Group, Project, VarEditing, VarSummary } from '../types';
import { Sidebar } from '../components/Sidebar';
import { VariablesTable } from '../components/VariablesTable';
import { VariableModal } from '../components/VariableModal';
import SettingsModal from '../components/SettingsModal';
import { Menu, Plus, Settings as Gear, RefreshCcw } from 'lucide-react';

function cls(...parts: (string | false | undefined)[]) { return parts.filter(Boolean).join(' '); }

function parseProjectId(): number | null {
  const m = window.location.pathname.match(/\/project\/(\d+)/);
  return m ? Number(m[1]) : null;
}

function ProjectPage() {
  const projectId = parseProjectId();

  const [tokenOk, setTokenOk] = useState<boolean>(false);
  const [healthReady, setHealthReady] = useState<boolean>(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const projectsReqRef = useRef(0);
  const [parentGroupId, setParentGroupId] = useState<number | null>(null);
  const [parentGroupName, setParentGroupName] = useState<string | undefined>(undefined);

  const [vars, setVars] = useState<VarSummary[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [varsError, setVarsError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState<boolean>(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<VarEditing | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [envOptions, setEnvOptions] = useState<string[]>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(15);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);

  const [projectName, setProjectName] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const h = await api.health();
        setTokenOk(!!h?.ok);
      } catch { setTokenOk(false); } finally { setHealthReady(true); }
      const cfg = await api.uiConfig();
      setAutoRefreshEnabled(!!cfg?.auto_refresh_enabled);
      setAutoRefreshSec(Number(cfg?.auto_refresh_sec || 15));

      // use hint from previous page if available
      try {
        const raw = sessionStorage.getItem('ui_proj_hint');
        if (raw) {
          const hint = JSON.parse(raw);
          if (hint?.name) setProjectName(hint.name);
          if (hint?.namespace_id) setParentGroupId(hint.namespace_id);
          if (hint?.namespace_full_path) setParentGroupName(hint.namespace_full_path);
          sessionStorage.removeItem('ui_proj_hint');
        }
      } catch {}

      // Load groups in background (for sidebar names)
      api.groups().then(setGroups).catch(()=>{});

      if (projectId) {
        // one combined backend call for project + variables + envs
        try {
          const bundle = await api.projectBundle(projectId);
          const proj = bundle.project;
          if (!projectName) setProjectName(proj?.name || proj?.path_with_namespace || '');
          const gid = proj?.namespace_id || null;
          if (gid && !parentGroupId) setParentGroupId(gid);
          if (!parentGroupName && proj?.namespace_full_path) setParentGroupName(proj.namespace_full_path);
          setVars(bundle.variables || []);
          setVarsError(null);
          setCanCreate(true);
          setEnvOptions(bundle.environments || []);
          // ensure sidebar has an initial project list for parent group
          if (gid) {
            setProjectsLoading(true);
            const reqId = ++projectsReqRef.current;
            const list = await api.projectsLimited(gid, '', 50);
            if (reqId === projectsReqRef.current) { setProjects(list); setProjectsLoading(false); }
          }
        } catch (e: any) {
          // fallback to individual calls if bundle fails
          await loadVars(projectId);
          setEnvOptions(await api.projectEnvs(projectId));
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!autoRefreshEnabled || !projectId) return;
    const t = setInterval(() => loadVars(projectId, true), Math.max(1, autoRefreshSec) * 1000);
    return () => clearInterval(t);
  }, [autoRefreshEnabled, autoRefreshSec, projectId]);

  async function loadVars(id: number, silent = false) {
    setVarsLoading(!silent);
    setCanCreate(false);
    try {
      const v = await api.vars({ kind: 'project', id });
      setVars(v); setVarsError(null); setCanCreate(true);
    } catch (e: any) {
      const status: number = e?.status ?? 0;
      if (status === 403) { setVars([]); setVarsError('Нет доступа к переменным для проекта.'); }
      else if (status === 404) { setVars([]); setVarsError('Проект не найден.'); }
      else { setVars([]); setVarsError('Не удалось загрузить переменные.'); }
    } finally { setVarsLoading(false); }
  }

  async function openCreate() {
    if (!projectId) return;
    const empty: VarEditing = { key: '', variable_type: 'file', environment_scope: '*', protected: false, masked: false, raw: false, value: '' } as any;
    setModalInitial(empty); setModalOpen(true); setModalError(null);
    setEnvOptions(await api.projectEnvs(projectId));
  }

  async function openEdit(v: VarSummary) {
    if (!projectId) return;
    try {
      const full = await api.varGet({ kind: 'project', id: projectId }, v.key, v.environment_scope || '*');
      const vt = (full.variable_type === 'env_var') ? 'variables' : (full.variable_type || 'file');
      const edit: VarEditing = { ...full, variable_type: vt as any, __originalKey: full.key, __originalEnv: full.environment_scope || '*' };
      setModalInitial(edit); setModalOpen(true); setModalError(null);
      setEnvOptions(await api.projectEnvs(projectId));
    } catch { await loadVars(projectId); }
  }

  async function saveEditing(draft: VarEditing) {
    if (!projectId) return;
    const backendType = (draft.variable_type === 'variables') ? 'env_var' : (draft.variable_type || 'file');
    const payload: any = {
      key: draft.key.trim(), variable_type: backendType,
      environment_scope: draft.environment_scope?.trim() || '*',
      protected: !!draft.protected, masked: !!draft.masked || !!(draft as any).hidden, raw: !!draft.raw,
      value: draft.value ?? '',
    };
    if ((draft as any).hidden) payload.masked_and_hidden = true;
    if ((draft as any).__originalKey) {
      payload.original_key = (draft as any).__originalKey;
      payload.original_environment_scope = (draft as any).__originalEnv || '*';
    }
    try {
      setModalError(null);
      await api.upsert({ kind: 'project', id: projectId }, payload);
      await loadVars(projectId);
      setModalOpen(false);
    } catch (e: any) {
      let friendly = e?.message || 'Не удалось сохранить переменную';
      if (e?.status === 400) {
        const d = e?.json?.detail || e?.json; const valErr = d?.message?.value;
        if (Array.isArray(valErr) && valErr[0] && (modalInitial?.masked || (modalInitial as any)?.hidden)) {
          friendly = 'Значение для маскированной переменной не соответствует требованиям GitLab. Используйте не менее 8 символов и допустимые символы.';
        }
      }
      setModalError(friendly); throw e;
    }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const handleSettingsSave = (refreshSec: number) => { setAutoRefreshSec(refreshSec); };

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
          <button className="lg:hidden p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню" title="Открыть меню навигации">
            <Menu size={18} />
          </button>
          <a className="text-[15px] font-semibold tracking-wide" href="/" title="На главную">GCVM - Gitlab CI\CD Variables Manager</a>
          <div className="ml-auto flex items-center gap-2">
            <button
              className={cls('inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm', (!projectId || varsLoading) && 'opacity-60 cursor-not-allowed')}
              onClick={() => { if (projectId) loadVars(projectId); }}
              disabled={!projectId || varsLoading}
              title="Обновить переменные"
            >
              <RefreshCcw size={16} /> <span className="hidden sm:inline">Обновить</span>
            </button>
            <button
              className={cls('inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm', (!projectId || !canCreate || varsLoading) && 'opacity-60 cursor-not-allowed')}
              onClick={openCreate}
              disabled={!projectId || !canCreate || varsLoading}
              title={!projectId ? 'Выберите проект' : (varsLoading ? 'Загрузка данных…' : (!canCreate ? 'Нет прав на редактирование переменных этого проекта' : 'Создать переменную'))}
            >
              <Plus size={16} /> <span className="hidden sm:inline">Создать</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm" onClick={() => setSettingsOpen(true)} title="Открыть настройки автообновления">
              <Gear size={16} /> <span className="hidden sm:inline">Настройки</span>
            </button>
          </div>
        </div>
      </header>
      {healthReady && !tokenOk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 max-w-md w-full rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-6 text-center shadow-2xl">
            <div className="text-lg font-semibold mb-1">Нет подключения к GitLab</div>
            <div className="text-sm mb-4">Проверьте указанные настройки и соединение с сетью.</div>
            <button className="px-3 py-1.5 rounded-full border border-rose-300 bg-white hover:bg-rose-50 text-sm" onClick={() => window.location.reload()}>Повторить попытку</button>
          </div>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto flex px-2 sm:px-4 overflow-x-hidden w-full">
        <div className="hidden lg:block">
          <Sidebar
            groups={groups}
            groupSearch={groupSearch}
            onGroupSearchChange={async (q) => { setGroupSearch(q); setGroups(await api.groups(q)); }}
            onPickGroup={(g) => { window.location.href = `/group/${g.id}`; return false; }}
            projects={projects}
            projectsLoading={projectsLoading}
            projectSearch={projectSearch}
            onProjectSearchChange={async (q) => {
              setProjectSearch(q);
              if (!parentGroupId) { setProjects([]); return; }
              setProjectsLoading(true);
              const reqId = ++projectsReqRef.current;
              const list = await api.projectsLimited(parentGroupId as any, q, q ? 0 as any : 50);
              if (reqId === projectsReqRef.current) { setProjects(list); setProjectsLoading(false); }
            }}
            onPickProject={(p) => { window.location.href = `/project/${p.id}`; }}
            selectedProjectId={projectId}
            currentGroupName={parentGroupName}
            initialOpenGroupId={parentGroupId}
          />
        </div>

        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 mx-2 w-[calc(100vw-16px)] max-w-[420px] bg-white border border-slate-200 p-2 rounded-2xl shadow-lg overflow-y-auto overflow-x-hidden">
              <Sidebar
                groups={groups}
                groupSearch={groupSearch}
                onGroupSearchChange={async (q) => { setGroupSearch(q); setGroups(await api.groups(q)); }}
                onPickGroup={(g) => { setSidebarOpen(false); window.location.href = `/group/${g.id}`; return false; }}
                projects={projects}
                projectsLoading={projectsLoading}
                projectSearch={projectSearch}
                onProjectSearchChange={async (q) => {
                  setProjectSearch(q);
                  if (!parentGroupId) { setProjects([]); return; }
                  setProjectsLoading(true);
                  const reqId = ++projectsReqRef.current;
                  const list = await api.projectsLimited(parentGroupId as any, q, q ? 0 as any : 50);
                  if (reqId === projectsReqRef.current) { setProjects(list); setProjectsLoading(false); }
                }}
                onPickProject={(p) => { setSidebarOpen(false); window.location.href = `/project/${p.id}`; }}
                selectedProjectId={projectId}
                currentGroupName={parentGroupName}
                initialOpenGroupId={parentGroupId}
              />
            </div>
          </div>
        )}

        <VariablesTable
          vars={vars}
          loading={varsLoading}
          error={varsError}
          onEdit={openEdit}
          hasContext={!!projectId}
          titleText={projectId ? `Проект: ${projectName || ''}` : 'Выберите контекст'}
        />
      </main>

      <VariableModal open={modalOpen} onClose={() => setModalOpen(false)} initial={modalInitial} envOptions={envOptions} onSave={saveEditing} error={modalError || undefined} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={refresh => setAutoRefreshSec(refresh)} currentValue={autoRefreshSec} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<ProjectPage />);
