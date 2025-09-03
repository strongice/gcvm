import React, { useState } from "react";
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
  } = props;

  return (
    <aside className="w-[320px] shrink-0 p-4">
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Группы</div>
          <input
            value={groupSearch}
            onChange={(e) => onGroupSearchChange(e.target.value)}
            placeholder="Поиск групп"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          />
        </div>

        <div className="max-h-[32vh] overflow-auto p-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => onPickGroup(g)}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50"
            >
              {g.full_path}
            </button>
          ))}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">
            Проекты{currentGroupName ? ` для: ${currentGroupName}` : ""}
          </div>
          <input
            value={projectSearch}
            onChange={(e) => onProjectSearchChange(e.target.value)}
            placeholder="Поиск проектов"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
          />
        </div>

        <div className="max-h-[40vh] overflow-auto p-2 pt-0">
          {projects.map((p) => {
            const selected = selectedProjectId === p.id;
            return (
              <button
                key={p.id}
                title={p.path_with_namespace || p.namespace_full_path || p.name}
                onClick={() => onPickProject(p)}
                className={cls("w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50", selected && "bg-slate-100 border border-slate-200")}
              >
                <span className="block truncate">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
