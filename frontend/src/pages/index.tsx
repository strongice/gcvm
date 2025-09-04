import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../reset.css';
import { api } from '../api';
import type { Group, Project } from '../types';
import Welcome from '../components/Welcome';
import { Menu, Settings as Gear, CheckCircle, RefreshCcw } from 'lucide-react';
import SettingsModal from '../components/SettingsModal';
import { Sidebar } from '../components/Sidebar';

function IndexPage() {
  const [tokenInfo, setTokenInfo] = useState<string>('');
  const [tokenOk, setTokenOk] = useState<boolean>(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const projectsReqRef = useRef(0);
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(null);
  const [currentGroupName, setCurrentGroupName] = useState<string | undefined>(undefined);

  const [counts, setCounts] = useState<{groups: number; projects: number}>({groups: 0, projects: 0});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefreshSec, setAutoRefreshSec] = useState<number>(15);

  useEffect(() => {
    (async () => {
      const h = await api.health();
      setTokenOk(!!h?.ok);
      setTokenInfo(h?.user?.name || h?.user?.username || '');
      const cfg = await api.uiConfig();
      setAutoRefreshSec(Number(cfg?.auto_refresh_sec || 15));
      const g = await api.groups();
      setGroups(g);
      try {
        const s = await api.stats();
        setCounts({ groups: s.groups_count || g.length, projects: s.projects_count || 0 });
        setProjects((s.projects_sample || []).slice(0, 6));
      } catch {}
    })();
  }, []);

  async function pickGroup(g: Group) {
    setCurrentGroupId(g.id);
    setCurrentGroupName((g as any).full_path || (g as any).name);
    setProjects([]);
    setProjectsLoading(true);
    const reqId = ++projectsReqRef.current;
    const list = await api.projects(g.id, projectSearch);
    if (reqId === projectsReqRef.current) {
      setProjects(list);
      setProjectsLoading(false);
    }
  }

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
          <button className="lg:hidden p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200" aria-label="Открыть меню" title="Открыть меню навигации" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </button>
          <span className="text-[15px] font-semibold tracking-wide">GitLab: CI/CD Variables</span>
          <div className="ml-auto flex items-center gap-2">
            {/* Mobile: icon only */}
            <span
              className={("inline-flex sm:hidden items-center justify-center w-8 h-8 rounded-full border ") + (tokenOk ? "bg-emerald-100 border-emerald-200 text-emerald-700" : "bg-rose-100 border-rose-200 text-rose-700")}
              title={tokenOk ? 'GitLab: подключено' : 'GitLab: нет подключения'}
            >
              <CheckCircle size={16} />
            </span>
            {/* Desktop/Tablet: full pill with text */}
            <span
              className={("hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm select-none ") + (tokenOk ? "bg-emerald-100 border-emerald-200 text-emerald-800" : "bg-rose-100 border-rose-200 text-rose-800")}
              title={tokenOk ? 'GitLab: подключено' : 'GitLab: нет подключения'}
            >
              <CheckCircle size={16} />
              {tokenOk ? ("Token OK" + (tokenInfo ? ": " + tokenInfo : "")) : "Token Error"}
            </span>
            <button
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm"
              onClick={async () => {
                const g = await api.groups();
                setGroups(g);
                try { const all = await api.projects(null as any, ''); setCounts({ groups: g.length, projects: all.length }); setProjects(all.slice(0, 6)); } catch {}
              }}
              title="Обновить данные"
            >
              <RefreshCcw size={16} /> <span className="hidden sm:inline">Обновить</span>
            </button>
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50 text-sm" onClick={() => setSettingsOpen(true)} title="Открыть настройки автообновления">
              <Gear size={16} /> <span className="hidden sm:inline">Настройки</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto flex px-2 sm:px-4 overflow-x-hidden w-full">
        {/* Sidebar Desktop */}
        <div className="hidden lg:block">
          <Sidebar
            groups={groups}
            groupSearch={groupSearch}
            onGroupSearchChange={async (q) => { setGroupSearch(q); setGroups(await api.groups(q)); }}
            onPickGroup={(g) => { window.location.href = `/group/${g.id}`; }}
            projects={projects}
            projectsLoading={projectsLoading}
            projectSearch={projectSearch}
            onProjectSearchChange={async (q) => {
              setProjectSearch(q);
              const gid = currentGroupId;
              if (!gid) { setProjects([]); return; }
              setProjectsLoading(true);
              const reqId = ++projectsReqRef.current;
              const list = await api.projects(gid as any, q);
              if (reqId === projectsReqRef.current) { setProjects(list); setProjectsLoading(false); }
            }}
            onPickProject={(p) => { window.location.href = `/project/${p.id}`; }}
            selectedProjectId={null}
            currentGroupName={currentGroupName}
          />
        </div>

        {/* Welcome content */}
        <Welcome groupsCount={counts.groups} projectsCount={counts.projects} sample={projects.filter((_,i)=>i<6)} onPickProject={(p) => { window.location.href = `/project/${p.id}`; }} />
      </main>

      {/* Sidebar Mobile Drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 mx-2 w-[calc(100vw-16px)] max-w-[420px] bg-white border border-slate-200 p-2 rounded-2xl shadow-lg overflow-y-auto overflow-x-hidden">
            <Sidebar
              groups={groups}
              groupSearch={groupSearch}
              onGroupSearchChange={async (q) => { setGroupSearch(q); setGroups(await api.groups(q)); }}
              onPickGroup={(g) => { setSidebarOpen(false); window.location.href = `/group/${g.id}`; }}
              projects={projects}
              projectsLoading={projectsLoading}
              projectSearch={projectSearch}
              onProjectSearchChange={async (q) => {
                setProjectSearch(q);
                const gid = currentGroupId;
                if (!gid) { setProjects([]); return; }
                setProjectsLoading(true);
                const reqId = ++projectsReqRef.current;
                const list = await api.projects(gid as any, q);
                if (reqId === projectsReqRef.current) { setProjects(list); setProjectsLoading(false); }
              }}
              onPickProject={(p) => { setSidebarOpen(false); window.location.href = `/project/${p.id}`; }}
              selectedProjectId={null}
              currentGroupName={currentGroupName}
            />
          </div>
        </div>
      )}

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={(sec)=>setAutoRefreshSec(sec)} currentValue={autoRefreshSec} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<IndexPage />);
