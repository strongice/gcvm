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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-lg shadow-slate-200/20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 flex-wrap">
          <button
            className="lg:hidden p-2.5 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 border border-slate-200/60 transition-all duration-200 shadow-sm hover:shadow-md"
            aria-label={t('app.menu.open')}
            title={t('app.menu.open')}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <span className="text-lg font-semibold text-slate-700 tracking-tight">{t('app.title')}</span>
          <div className="ml-auto flex items-center gap-3">
            <button 
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 border border-slate-200/60 text-slate-700 hover:text-slate-800 text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200" 
              onClick={() => setSettingsOpen(true)} 
              title={t('action.settings')}
            >
              <Gear size={16} /> <span className="hidden sm:inline">{t('action.settings')}</span>
            </button>
          </div>
        </div>
      </header>

      {healthReady && !tokenOk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 max-w-md w-full rounded-3xl border border-red-200/60 bg-gradient-to-br from-red-50 to-rose-100 text-red-900 p-8 text-center shadow-2xl shadow-red-500/20">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="text-xl font-bold mb-2">{t('app.connection.lost')}</div>
            <div className="text-sm mb-6 text-red-700 leading-relaxed">{t('app.connection.tip')}</div>
            <button 
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-medium shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all duration-200 transform hover:-translate-y-0.5" 
              onClick={() => window.location.reload()}
            >
              {t('app.retry')}
            </button>
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
