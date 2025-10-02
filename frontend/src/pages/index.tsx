import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../reset.css';
import { api } from '../api';
import type { Project } from '../types';
import Welcome from '../components/Welcome';
import { Menu, Settings as Gear } from 'lucide-react';
import SettingsModal from '../components/SettingsModal';
import { Sidebar } from '../components/Sidebar';
import { I18nProvider, useI18n } from '../i18n/context';

const PROJECTS_PAGE_SIZE = 3;

function IndexPage() {
  const { t } = useI18n();
  const [tokenOk, setTokenOk] = useState<boolean>(false);
  const [healthReady, setHealthReady] = useState<boolean>(false);
  const [projectSample, setProjectSample] = useState<Project[]>([]);

  const [counts, setCounts] = useState<{groups: number; projects: number}>({groups: 0, projects: 0});
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchProjects = React.useCallback((groupId: number, search: string, page: number) => {
    return api.projectsPage({
      groupId,
      search: search.trim(),
      page,
      perPage: PROJECTS_PAGE_SIZE,
    });
  }, []);

  const fetchAllProjects = React.useCallback((groupId: number, search: string) => {
    return api.projects(groupId, search.trim() || "");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const h = await api.health();
        setTokenOk(!!h?.ok);
      } catch {
        setTokenOk(false);
      } finally {
        setHealthReady(true);
      }

      try {
        const stats = await api.stats();
        setCounts({
          groups: stats.groups_count ?? 0,
          projects: stats.projects_count ?? 0,
        });
        setProjectSample((stats.projects_sample || []).slice(0, 6));
      } catch {}
    })();
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            className="lg:hidden p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200"
            aria-label={t('app.menu.open')}
            title={t('app.menu.open')}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <span className="text-[16px] font-semibold tracking-wide text-slate-800">{t('app.title')}</span>
          <div className="ml-auto flex items-center gap-2">
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-sm text-blue-700" onClick={() => setSettingsOpen(true)} title={t('action.settings')}>
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
        {/* Sidebar Desktop */}
        <div className="hidden lg:block">
          <Sidebar
            onPickGroup={(g) => { window.location.href = `/group/${g.id}`; return false; }}
            onPickProject={(p) => { window.location.href = `/project/${p.id}`; }}
            fetchProjects={fetchProjects}
            fetchAllProjects={fetchAllProjects}
            selectedGroupId={null}
            selectedProjectId={null}
            onResetGroups={() => { window.location.href = '/'; }}
          />
        </div>

        {/* Welcome content */}
        <Welcome groupsCount={counts.groups} projectsCount={counts.projects} sample={projectSample.slice(0, 6)} onPickProject={(p) => { try { sessionStorage.setItem('ui_proj_hint', JSON.stringify(p)); } catch {} ; window.location.href = `/project/${p.id}`; }} />
      </main>

      {/* Sidebar Mobile Drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 mx-2 w-[calc(100vw-16px)] max-w-[420px] bg-white border border-slate-200 p-2 rounded-2xl shadow-lg overflow-y-auto overflow-x-hidden">
            <Sidebar
              onPickGroup={(g) => { setSidebarOpen(false); window.location.href = `/group/${g.id}`; return false; }}
              onPickProject={(p) => { setSidebarOpen(false); window.location.href = `/project/${p.id}`; }}
              fetchProjects={fetchProjects}
              fetchAllProjects={fetchAllProjects}
              selectedGroupId={null}
              selectedProjectId={null}
              onResetGroups={() => { setSidebarOpen(false); window.location.href = '/'; }}
            />
          </div>
        </div>
      )}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <IndexPage />
  </I18nProvider>
);
