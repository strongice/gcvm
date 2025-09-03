import React from "react";
import type { Project } from "../types";
import { FolderOpen, Search } from "lucide-react";

export function Welcome(props: {
  groupsCount: number;
  projectsCount: number;
  sample: Project[];
  onPickProject: (p: Project) => void;
}) {
  const { groupsCount, projectsCount, sample, onPickProject } = props;
  return (
    <section className="flex-1 p-3">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="text-2xl font-semibold mb-1">Добро пожаловать в Variables Manager</div>
          <div className="text-slate-600 text-sm">Выберите группу и проект слева, чтобы управлять CI/CD переменными. Пока ничего не выбрано — это стартовая страница.</div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500 flex items-center gap-2"><FolderOpen size={16}/> Групп</div>
            <div className="text-3xl font-semibold mt-1">{groupsCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500 flex items-center gap-2"><FolderOpen size={16}/> Проектов</div>
            <div className="text-3xl font-semibold mt-1">{projectsCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500 flex items-center gap-2"><Search size={16}/> Быстрый старт</div>
            <ol className="text-sm mt-1 list-decimal ml-5 text-slate-700">
              <li>Найдите группу</li>
              <li>Выберите проект</li>
              <li>Создайте переменную</li>
            </ol>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="text-slate-700 font-medium mb-3">Недавние проекты</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sample.map((p) => (
              <button
                key={p.id}
                className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50"
                title={p.path_with_namespace || p.name}
                onClick={() => onPickProject(p)}
              >
                <div className="font-medium truncate">{p.path_with_namespace || p.name}</div>
                {/* место под дополнительные метки при желании */}
              </button>
            ))}
          </div>
          {sample.length === 0 && (
            <div className="text-sm text-slate-500">Проекты не найдены. Выберите группу слева.</div>
          )}
          <div className="text-xs text-slate-500 mt-4">Подсказка: можно использовать поиск по группам и проектам в левой панели.</div>
        </div>
      </div>
    </section>
  );
}

export default Welcome;

