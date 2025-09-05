import React, { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { Group, Project } from "../types";

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Sidebar(props: {
  groups: Group[];
  groupSearch: string;
  onGroupSearchChange: (q: string) => void;
  onPickGroup: (g: Group) => void | boolean | Promise<void | boolean>;

  projects: Project[];
  projectsLoading?: boolean;
  projectSearch: string;
  onProjectSearchChange: (q: string) => void;
  onPickProject: (p: Project) => void;

  selectedProjectId: number | null;
  currentGroupName?: string;
  initialOpenGroupId?: number | null;
  // When true (default), clicking a group toggles accordion open locally.
  // Set to false on pages that navigate immediately (e.g., index) to avoid a brief flicker before navigation.
  expandOnGroupClick?: boolean;
}) {
  const {
    groups,
    groupSearch,
    onGroupSearchChange,
    onPickGroup,
    projects,
    projectsLoading,
    projectSearch,
    onProjectSearchChange,
    onPickProject,
    selectedProjectId,
    initialOpenGroupId,
    expandOnGroupClick = true,
  } = props;

  const [openGroupId, setOpenGroupId] = useState<number | null>(initialOpenGroupId ?? null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const restoredRef = React.useRef(false); // not used to short-circuit anymore
  const restoringNowRef = React.useRef(false);

  // Restore scroll position across page reloads (desktop sidebar)
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ui_sidebar_scroll_top');
      const top = raw ? parseInt(raw, 10) : 0;
      if (!isNaN(top) && scrollRef.current) {
        // Delay to ensure content is rendered
        const restore = () => {
          if (scrollRef.current) scrollRef.current.scrollTop = top;
        };
        restoringNowRef.current = true;
        requestAnimationFrame(() => {
          restore();
          // second frame to catch layout shifts
          requestAnimationFrame(() => {
            restore();
            // do not short-circuit further restores here; groups may not be loaded yet
            setTimeout(() => { restoringNowRef.current = false; }, 50);
          });
        });
      }
    } catch {}
    return () => {};
  }, []);

  // Restore again when groups/open state arrive after async fetch
  React.useEffect(() => {
    try {
      const anchor = sessionStorage.getItem('ui_sidebar_anchor_gid');
      if (anchor && scrollRef.current) {
        const el = document.getElementById(`sb-group-${anchor}`) as HTMLElement | null;
        const container = scrollRef.current;
        if (el) {
          // Compute relative offset within the sidebar container
          const cRect = container.getBoundingClientRect();
          const eRect = el.getBoundingClientRect();
          const delta = eRect.top - cRect.top; // position of el inside container viewport
          const target = container.scrollTop + delta - (container.clientHeight / 2) + (el.clientHeight / 2);
          container.scrollTop = Math.max(0, target);
          // If projects expand later, re-center after a tick
          setTimeout(() => {
            try {
              const e2 = document.getElementById(`sb-group-${anchor}`);
              if (e2 && scrollRef.current) {
                const cR2 = scrollRef.current.getBoundingClientRect();
                const eR2 = e2.getBoundingClientRect();
                const d2 = eR2.top - cR2.top;
                const t2 = scrollRef.current.scrollTop + d2 - (scrollRef.current.clientHeight / 2) + ((e2 as HTMLElement).clientHeight / 2);
                scrollRef.current.scrollTop = Math.max(0, t2);
              }
            } catch {}
            try { sessionStorage.removeItem('ui_sidebar_anchor_gid'); } catch {}
          }, 120);
          return;
        }
      }
      const raw = sessionStorage.getItem('ui_sidebar_scroll_top');
      const top = raw ? parseInt(raw, 10) : 0;
      if (!isNaN(top) && scrollRef.current && (groups?.length || 0) > 0) {
        restoringNowRef.current = true;
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = top;
          // one more frame after potential expand
          requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = top;
            setTimeout(() => { restoringNowRef.current = false; }, 50);
          });
        });
      }
    } catch {}
  }, [groups, openGroupId]);

  const rememberScroll = React.useCallback(() => {
    try {
      if (restoringNowRef.current) return;
      const top = scrollRef.current?.scrollTop ?? 0;
      sessionStorage.setItem('ui_sidebar_scroll_top', String(Math.max(0, Math.floor(top))));
    } catch {}
  }, []);
  React.useEffect(() => {
    if (typeof initialOpenGroupId !== 'undefined') {
      setOpenGroupId(initialOpenGroupId);
    }
  }, [initialOpenGroupId]);

  return (
    <aside
      ref={scrollRef}
      className="w-[360px] shrink-0 p-3 max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden"
    >
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Группы + Аккордеон */}
        <div className="p-3 border-b border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Группы</div>
          <div className="relative mb-2">
            <input
              value={groupSearch}
              onChange={(e) => onGroupSearchChange(e.target.value)}
              placeholder="Поиск групп"
              className="w-full gl-input text-sm pl-9"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="space-y-2">
            {[...groups].sort((a,b)=> (a.full_path||a.name).localeCompare(b.full_path||b.name)).map((g) => {
              const opened = openGroupId === g.id;
              return (
                <div key={g.id} id={`sb-group-${g.id}`} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={async () => {
                      try { sessionStorage.setItem('ui_sidebar_anchor_gid', String(g.id)); } catch {}
                      rememberScroll();
                      const res = await onPickGroup(g);
                      if (expandOnGroupClick && res !== false) {
                        setOpenGroupId(opened ? null : g.id);
                      }
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-white"
                    title={g.full_path}
                  >
                    <span className="truncate">{g.full_path}</span>
                    {opened ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </button>

                  {opened && (
                      <div className="p-3 border-t border-slate-200">
                      <div className="relative mb-2">
                        <input
                          value={projectSearch}
                          onChange={(e) => onProjectSearchChange(e.target.value)}
                          placeholder={`Поиск проектов`}
                          className="w-full gl-input text-sm pl-9"
                        />
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      </div>
                      <div className="p-1">
                        {projectsLoading ? (
                          <div className="px-3 py-2 text-sm text-slate-500">Загрузка…</div>
                        ) : projects.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-500">Нет проектов</div>
                        ) : projects.map((p) => {
                          const selected = selectedProjectId === p.id;
                          return (
                            <button
                              key={p.id}
                              title={p.name}
                              onClick={() => { try { if (openGroupId) sessionStorage.setItem('ui_sidebar_anchor_gid', String(openGroupId)); } catch {} ; rememberScroll(); onPickProject(p); }}
                              className={cls("w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50", selected && "bg-slate-100 border border-slate-200")}
                            >
                              <span className="block truncate">{p.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
