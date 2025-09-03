import React, { useState } from "react";
import { Search } from "lucide-react";
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
  projectSearch: string;
  onProjectSearchChange: (q: string) => void;
  onPickProject: (p: Project) => void;

  selectedProjectId: number | null;
  currentGroupName?: string;
  onGoRoot?: () => void;
}) {
  const {
    groups,
    groupSearch,
    onGroupSearchChange,
    onPickGroup,
    projects,
    projectSearch,
    onProjectSearchChange,
    onPickProject,
    selectedProjectId,
    currentGroupName,
    onGoRoot,
  } = props;

  return (
    <aside className="w-[320px] shrink-0 p-3">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* Подгруппы / Группы */}
        <div className="p-3 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-500">{currentGroupName ? `Подгруппы для: ${currentGroupName}` : 'Группы'}</div>
            {currentGroupName && (
              <button className="text-xs text-slate-500 hover:text-slate-700" onClick={onGoRoot}>Все группы</button>
            )}
          </div>
          <div className="relative">
            <input
              value={groupSearch}
              onChange={(e) => onGroupSearchChange(e.target.value)}
              placeholder={currentGroupName ? "Поиск подгрупп" : "Поиск групп"}
              className="w-full gl-input text-sm pl-9"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="max-h-[28vh] overflow-auto p-2 pl-0 pr-0">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onPickGroup(g)}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50"
                title={g.full_path}
              >
                <span className="block truncate">{g.full_path}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">Нет подгрупп</div>
            )}
          </div>
        </div>

        {/* Проекты */}
        <div className="p-3">
          <div className="text-xs text-slate-500 mb-2">Проекты{currentGroupName ? '' : ' (выберите группу)'}</div>
          <div className="relative mb-2">
            <input
              value={projectSearch}
              onChange={(e) => onProjectSearchChange(e.target.value)}
              placeholder="Поиск проектов"
              className="w-full gl-input text-sm pl-9"
              disabled={!currentGroupName}
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <div className="max-h-[36vh] overflow-auto p-1">
            {projects.map((p) => {
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
            {currentGroupName && projects.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">Нет проектов</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
