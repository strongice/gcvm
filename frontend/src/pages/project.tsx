import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../reset.css';
import { api } from '../api';
import type { VarEditing, VarSummary } from '../types';
import { Sidebar } from '../components/Sidebar';
import { VariablesTable } from '../components/VariablesTable';
import { VariableModal } from '../components/VariableModal';
import SettingsModal from '../components/SettingsModal';
import { Menu, Plus, Settings as Gear, RefreshCcw } from 'lucide-react';
import { I18nProvider, useI18n } from '../i18n/context';

function cls(...parts: (string | false | undefined)[]) { return parts.filter(Boolean).join(' '); }

function parseProjectId(): number | null {
  const m = window.location.pathname.match(/\/project\/(\d+)/);
  return m ? Number(m[1]) : null;
}

const PROJECTS_PAGE_SIZE = 3;
const DEFAULT_VARS_VISIBLE = 6;

function ProjectPage() {
  const { t } = useI18n();
  const projectId = parseProjectId();
  const navigationEntry = (typeof performance !== 'undefined' && 'getEntriesByType' in performance)
    ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
    : undefined;
  const isReloadNavigation = navigationEntry?.type === 'reload'
    || (typeof performance !== 'undefined' && (performance as any)?.navigation?.type === 1);

  const initialHint = React.useMemo<{ name?: string; namespace_id?: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem('ui_proj_hint');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [tokenOk, setTokenOk] = useState<boolean>(false);
  const [healthReady, setHealthReady] = useState<boolean>(false);
  const [parentGroupId, setParentGroupId] = useState<number | null>(() => {
    if (initialHint?.namespace_id) return Number(initialHint.namespace_id) || null;
    try {
      const raw = sessionStorage.getItem('ui_projects_keep_group');
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });

  const [vars, setVars] = useState<VarSummary[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [varsError, setVarsError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [varsVisibleCount, setVarsVisibleCount] = useState<number>(DEFAULT_VARS_VISIBLE);
  const [varsShowAll, setVarsShowAll] = useState<boolean>(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<VarEditing | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [envOptions, setEnvOptions] = useState<string[]>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [projectName, setProjectName] = useState<string>(() => initialHint?.name || '');

  const fetchProjects = React.useCallback((gid: number, search: string, page: number) => {
    return api.projectsPage({
      groupId: gid,
      search: search.trim(),
      page,
      perPage: PROJECTS_PAGE_SIZE,
    });
  }, []);

  const fetchAllProjects = React.useCallback((gid: number, search: string) => {
    return api.projects(gid, search.trim() || "");
  }, []);

  const showAllStorageKey = projectId ? `ui_project_vars_show_all_${projectId}` : null;

  useEffect(() => {
    if (projectId) {
      if (isReloadNavigation) {
        try {
          const stored = showAllStorageKey ? sessionStorage.getItem(showAllStorageKey) : null;
          const shouldShowAll = stored === '1';
          setVarsShowAll(shouldShowAll);
        } catch {
          setVarsShowAll(false);
        }
      } else {
        setVarsShowAll(false);
      }
      setVarsVisibleCount(DEFAULT_VARS_VISIBLE);
    } else {
      setVarsShowAll(false);
      setVarsVisibleCount(0);
    }
  }, [projectId, showAllStorageKey, isReloadNavigation]);

  useEffect(() => {
    if (!showAllStorageKey) return;
    try {
      if (varsShowAll) {
        sessionStorage.setItem(showAllStorageKey, '1');
      } else {
        sessionStorage.removeItem(showAllStorageKey);
      }
    } catch {}
  }, [showAllStorageKey, varsShowAll]);

  useEffect(() => {
    return () => {
      try {
        const returnFlag = sessionStorage.getItem('ui_projects_return_to_group') === '1';
        if (!returnFlag) {
          sessionStorage.removeItem('ui_project_list_pref_v1');
          sessionStorage.removeItem('ui_projects_keep_group');
        } else {
          sessionStorage.removeItem('ui_projects_keep_group');
        }
        sessionStorage.removeItem('ui_projects_return_to_group');
        sessionStorage.removeItem('ui_projects_leave_reason');
      } catch {}
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const h = await api.health();
        if (!cancelled) setTokenOk(!!h?.ok);
      } catch {
        if (!cancelled) setTokenOk(false);
      } finally {
        if (!cancelled) setHealthReady(true);
      }

      if (initialHint) {
        if (initialHint.name) {
          setProjectName((prev) => prev || initialHint.name || '');
        }
        if (initialHint.namespace_id !== undefined && initialHint.namespace_id !== null) {
          const normalized = Number(initialHint.namespace_id);
          if (Number.isFinite(normalized)) {
            setParentGroupId((prev) => (prev ?? normalized));
          }
        }
        try {
          sessionStorage.removeItem('ui_proj_hint');
        } catch {}
      }

      if (projectId) {
        try {
          const bundle = await api.projectBundle(projectId);
          if (cancelled) return;
          const proj = bundle.project;
          setProjectName((prev) => prev || proj?.name || proj?.path_with_namespace || '');
          const gid = proj?.namespace_id || null;
          if (gid) {
            setParentGroupId((prev) => (prev ?? gid));
          }
          const varsData = bundle.variables || [];
          setVars(varsData);
          setVarsError(null);
          setCanCreate(true);
          setVarsVisibleCount(varsData.length ? Math.min(DEFAULT_VARS_VISIBLE, varsData.length) : 0);
          setEnvOptions(bundle.environments || []);
        } catch {
          if (cancelled) return;
          await loadVars(projectId, { resetAvailability: true, resetVisible: true });
          if (cancelled) return;
          try {
            const envs = await api.projectEnvs(projectId);
            if (!cancelled) setEnvOptions(envs);
          } catch {}
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, initialHint]);

  useEffect(() => {
    if (!projectId) return;
    const timer = setInterval(() => loadVars(projectId, { silent: true, resetVisible: false }), 5000);
    return () => clearInterval(timer);
  }, [projectId]);

  async function loadVars(
    id: number,
    options: { silent?: boolean; resetAvailability?: boolean; resetVisible?: boolean } = {},
  ) {
    const { silent = false, resetAvailability = false, resetVisible = false } = options;
    setVarsLoading(!silent);
    if (resetAvailability) {
      setCanCreate(null);
    }
    const prevVisible = varsVisibleCount;
    const prevTotal = vars.length;
    try {
      const v = await api.vars({ kind: 'project', id });
      setVars(v);
      setVarsError(null);
      setCanCreate(true);
      setVarsVisibleCount(() => {
        if (v.length === 0) {
          return 0;
        }
        if (varsShowAll || (prevVisible >= prevTotal && prevTotal > 0)) {
          return v.length;
        }
        if (resetVisible) {
          return Math.min(DEFAULT_VARS_VISIBLE, v.length);
        }
        const prevEffective = prevVisible && prevVisible > 0 ? prevVisible : Math.min(DEFAULT_VARS_VISIBLE, v.length);
        if (prevEffective >= v.length) {
          return v.length;
        }
        return Math.min(prevEffective, v.length);
      });
    } catch (e: any) {
      const status: number = e?.status ?? 0;
      if (status === 403) {
        setVars([]);
        setVarsError(t('app.error.project.forbidden'));
      } else if (status === 404) {
        setVars([]);
        setVarsError(t('app.error.project.notfound'));
      } else {
        setVars([]);
        setVarsError(t('app.error.generic'));
      }
      setCanCreate(false);
      setVarsVisibleCount(0);
    } finally {
      setVarsLoading(false);
    }
  }

  const handleShowAllVars = () => {
    setVarsShowAll(true);
    setVarsVisibleCount(vars.length);
  };

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
      let friendly = e?.message || t('modal.variable.error.save');
      if (e?.status === 400) {
        const d = e?.json?.detail || e?.json; const valErr = d?.message?.value;
        if (Array.isArray(valErr) && valErr[0] && (modalInitial?.masked || (modalInitial as any)?.hidden)) {
          friendly = t('modal.variable.masked.hint');
        }
      }
      setModalError(friendly); throw e;
    }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            className="lg:hidden p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('app.menu.open')}
            title={t('app.menu.open')}
          >
            <Menu size={18} />
          </button>
          <a
            className="text-[16px] font-semibold tracking-wide text-slate-800"
            href="/"
            title={t('app.title')}
          >
            {t('app.title')}
          </a>
          <div className="ml-auto flex items-center gap-2">
            <button
              className={cls('inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-transparent bg-blue-600 hover:bg-blue-700 text-white text-sm shadow-sm', (!projectId || varsLoading) && 'opacity-60 cursor-not-allowed')}
              onClick={() => { if (projectId) loadVars(projectId); }}
              disabled={!projectId || varsLoading}
              title={t('app.refresh.title')}
            >
              <RefreshCcw size={16} /> <span className="hidden sm:inline">{t('app.refresh')}</span>
            </button>
            <button
              className={cls(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-sm text-blue-700 transition-opacity',
                (!projectId || canCreate === false) && 'opacity-60 cursor-not-allowed'
              )}
              onClick={openCreate}
              disabled={!projectId || canCreate === false}
              title={!projectId
                ? t('app.select.project')
                : (canCreate === false
                    ? t('app.error.project.forbidden')
                    : (canCreate === null ? t('settings.language.auto_hint') : t('action.create')))}
            >
              <Plus size={16} /> <span className="hidden sm:inline">{t('action.create')}</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm" onClick={() => setSettingsOpen(true)} title={t('action.settings')}>
              <Gear size={16} /> <span className="hidden sm:inline">{t('action.settings')}</span>
            </button>
          </div>
        </div>
      </header>
      {healthReady && !tokenOk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10 max-w-md w-full rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 p-6 text-center shadow-2xl">
            <div className="text-lg font-semibold mb-1">{t('app.connection.lost')}</div>
            <div className="text-sm mb-4">{t('app.connection.tip')}</div>
            <button className="px-3 py-1.5 rounded-full border border-rose-300 bg-white hover:bg-rose-50 text-sm" onClick={() => window.location.reload()}>{t('app.retry')}</button>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto flex px-3 sm:px-6 pb-8 pt-6 gap-4 overflow-x-hidden w-full">
        <div className="hidden lg:block">
          <Sidebar
            onPickGroup={(g) => { window.location.href = `/group/${g.id}`; return false; }}
            onPickProject={async (p) => {
              if (p.id === projectId) return;
              try { sessionStorage.setItem('ui_proj_hint', JSON.stringify(p)); } catch {}
              window.location.href = `/project/${p.id}`;
            }}
            fetchProjects={fetchProjects}
            fetchAllProjects={fetchAllProjects}
            selectedGroupId={parentGroupId}
            selectedProjectId={projectId ?? null}
            onResetGroups={() => { window.location.href = '/'; }}
          />
        </div>

        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 mx-2 w-[calc(100vw-16px)] max-w-[420px] bg-white border border-slate-200 p-2 rounded-2xl shadow-lg overflow-y-auto overflow-x-hidden">
            <Sidebar
              onPickGroup={(g) => { setSidebarOpen(false); window.location.href = `/group/${g.id}`; return false; }}
              onPickProject={async (p) => {
                setSidebarOpen(false);
                if (p.id === projectId) return;
                try { sessionStorage.setItem('ui_proj_hint', JSON.stringify(p)); } catch {}
                window.location.href = `/project/${p.id}`;
              }}
              fetchProjects={fetchProjects}
              fetchAllProjects={fetchAllProjects}
              selectedGroupId={parentGroupId}
              selectedProjectId={projectId ?? null}
              onResetGroups={() => { setSidebarOpen(false); window.location.href = '/'; }}
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
          titleText={projectId ? `${t('sidebar.projects')}: ${projectName || ''}` : t('app.select.context')}
          visibleCount={varsShowAll ? vars.length : varsVisibleCount}
          onShowAll={varsShowAll ? undefined : handleShowAllVars}
        />
      </main>

      <VariableModal open={modalOpen} onClose={() => setModalOpen(false)} initial={modalInitial} envOptions={envOptions} onSave={saveEditing} error={modalError || undefined} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <ProjectPage />
  </I18nProvider>
);
