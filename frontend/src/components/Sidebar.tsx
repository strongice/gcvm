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
  onPickGroup: (g: Group) => void;

  projects: Project[];
  projectsLoading?: boolean;
  projectSearch: string;
  onProjectSearchChange: (q: string) => void;
  onPickProject: (p: Project) => void;

  selectedProjectId: number | null;
  currentGroupName?: string;
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
  } = props;

  const [openGroupId, setOpenGroupId] = useState<number | null>(null);

  return (
    <aside className="w-[360px] shrink-0 p-3 max-h-[calc(100vh-120px)] overflow-auto">
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
                <div key={g.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={async () => { setOpenGroupId(opened ? null : g.id); await onPickGroup(g); }}
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
                              onClick={() => onPickProject(p)}
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
