import React from "react";
import type { Project } from "../types";
import { FolderOpen, Search } from "lucide-react";
import { useI18n } from "../i18n/context";

export function Welcome(props: {
  groupsCount: number;
  projectsCount: number;
  sample: Project[];
  onPickProject: (p: Project) => void;
}) {
  const { groupsCount, projectsCount } = props; // sample список убран с лендинга
  const { t } = useI18n();
  return (
    <section className="flex-1 p-4">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-7 py-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-transparent">
          <div className="text-2xl font-semibold mb-1 text-slate-800">{t('app.title')}</div>
          <div className="text-slate-600 text-sm leading-relaxed">{t('welcome.description')}</div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase text-slate-500 tracking-wide flex items-center gap-2"><FolderOpen size={16}/> {t('welcome.groups_count')}</div>
            <div className="text-3xl font-semibold mt-2 text-slate-800">{groupsCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase text-slate-500 tracking-wide flex items-center gap-2"><FolderOpen size={16}/> {t('welcome.projects_count')}</div>
            <div className="text-3xl font-semibold mt-2 text-slate-800">{projectsCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase text-slate-500 tracking-wide flex items-center gap-2"><Search size={16}/> {t('welcome.quickstart')}</div>
            <ol className="text-sm mt-2 list-decimal ml-5 text-slate-700 leading-relaxed">
              <li>{t('welcome.step.find_group')}</li>
              <li>{t('welcome.step.choose_project')}</li>
              <li>{t('welcome.step.create_variable')}</li>
            </ol>
          </div>
        </div>

        {/* Подсказка удалена по требованию */}
      </div>
    </section>
  );
}

export default Welcome;
