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
      <div className="rounded-3xl border border-slate-300/70 bg-white shadow-lg shadow-slate-300/25 overflow-hidden backdrop-blur-sm">
        <div className="px-8 py-8 border-b border-slate-300/60 bg-gradient-to-r from-blue-50 via-indigo-50/30 to-purple-50/20">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-800 tracking-tight">{t('app.title')}</div>
              <div className="text-slate-600 text-base leading-relaxed mt-1">{t('welcome.description')}</div>
            </div>
          </div>
        </div>

        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-blue-300/70 bg-gradient-to-br from-blue-50 to-indigo-100 p-6 shadow-lg shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center">
                <FolderOpen size={16}/>
              </div>
              <div className="text-sm font-bold uppercase text-blue-700 tracking-wider">{t('welcome.groups_count')}</div>
            </div>
            <div className="text-4xl font-bold text-blue-900">{groupsCount}</div>
          </div>
          
          <div className="rounded-2xl border border-emerald-300/70 bg-gradient-to-br from-emerald-50 to-green-100 p-6 shadow-lg shadow-emerald-500/15 hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                <FolderOpen size={16}/>
              </div>
              <div className="text-sm font-bold uppercase text-emerald-700 tracking-wider">{t('welcome.projects_count')}</div>
            </div>
            <div className="text-4xl font-bold text-emerald-900">{projectsCount}</div>
          </div>
          
          <div className="rounded-2xl border border-purple-300/70 bg-gradient-to-br from-purple-50 to-violet-100 p-6 shadow-lg shadow-purple-500/15 hover:shadow-xl hover:shadow-purple-500/20 transition-all duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center">
                <Search size={16}/>
              </div>
              <div className="text-sm font-bold uppercase text-purple-700 tracking-wider">{t('welcome.quickstart')}</div>
            </div>
            <ol className="text-sm list-decimal ml-5 text-purple-800 leading-relaxed space-y-1">
              <li className="font-medium">{t('welcome.step.find_group')}</li>
              <li className="font-medium">{t('welcome.step.choose_project')}</li>
              <li className="font-medium">{t('welcome.step.create_variable')}</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Welcome;
