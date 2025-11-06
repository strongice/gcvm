import React from "react";
import type { VarSummary } from "../types";
import { EyeOff, Shield, ShieldOff, Pencil, Check, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/context";

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function VariablesTable(props: {
  vars: VarSummary[];
  loading: boolean;
  error: string | null;
  onEdit: (v: VarSummary) => void;
  onDelete: (v: VarSummary) => void;
  hasContext: boolean;
  titleText: string;
  visibleCount: number;
  onShowAll?: () => void;
}) {
  const { vars, loading, error, onEdit, onDelete, hasContext, titleText, visibleCount, onShowAll } = props;
  const { t } = useI18n();
  const effectiveCount = Number.isFinite(visibleCount) ? Math.max(visibleCount, 0) : 0;
  const visibleItems = vars.slice(0, effectiveCount);
  const canShowMore = Boolean(!loading && !error && onShowAll && vars.length > visibleItems.length);

  return (
    <section className="flex-1 p-4 overflow-hidden flex flex-col">
      <div className="rounded-3xl border border-slate-300/70 bg-white shadow-lg shadow-slate-300/25 overflow-hidden backdrop-blur-sm flex flex-col h-full">
        <div className="px-6 py-5 border-b border-slate-300/60 bg-gradient-to-r from-blue-50 via-indigo-50/30 to-purple-50/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5"><path d="M2.5 2h11a.5.5 0 01.5.5v11l-3-2-3 2-3-2-3 2v-11a.5.5 0 01.5-.5z"/></svg>
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800 tracking-tight">{titleText}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {vars.length > 0 && `${vars.length} ${vars.length === 1 ? t('var.count.single') : t('var.count.multiple')}`}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="min-w-full text-sm">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100/50 sticky top-0 z-10">
              <tr className="[&>th]:py-4 [&>th]:px-4 [&>th]:text-slate-700 [&>th]:font-semibold [&>th]:text-xs [&>th]:uppercase [&>th]:tracking-wider [&>th]:border-b [&>th]:border-slate-300/60">
                <th className="text-left">{t("var.table.key")}</th>
                <th className="hidden md:table-cell text-left">{t("var.table.type")}</th>
                <th className="text-left">{t("var.table.env")}</th>
                <th className="hidden md:table-cell text-left">{t("var.table.protected")}</th>
                <th className="hidden md:table-cell text-left">{t("var.table.masked")}</th>
                <th className="hidden md:table-cell text-left">{t("var.table.expand")}</th>
                <th className="text-center">{t("var.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={7}>
                    {t("var.table.loading")}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="py-8 text-center text-amber-600" colSpan={7}>
                    {error}
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={7}>
                    {hasContext ? t("var.table.none") : t("var.table.no_context")}
                  </td>
                </tr>
              ) : (
                visibleItems.map((v, index) => {
                  const expand = !(v.raw === true);
                  return (
                    <tr
                      key={`${v.key}|${v.environment_scope}`}
                      className={cls(
                        "group transition-all duration-200 [&>td]:py-4 [&>td]:px-4 [&>td]:border-b [&>td]:border-slate-200/70",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/30",
                        "hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/30 hover:shadow-sm"
                      )}
                    >
                      <td>
                        <div className="font-mono text-sm font-medium text-slate-800 group-hover:text-slate-900">
                          {v.key}
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className={cls(
                          "inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm border-0",
                          v.variable_type === 'env_var' 
                            ? "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800" 
                            : "bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-800"
                        )}>
                          {v.variable_type === 'env_var' ? 'Variable' : 'File'}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-100 to-slate-200/50 text-slate-700 text-xs font-medium shadow-sm border border-slate-200/50">
                          {v.environment_scope || "*"}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">
                        {v.protected ? (
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                            <Shield size={14} />
                            <span className="text-xs font-medium">{t("var.protected.yes")}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
                            <ShieldOff size={14} />
                            <span className="text-xs">{t("var.protected.no")}</span>
                          </div>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {v.masked ? (
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-amber-50 text-amber-700">
                            <EyeOff size={14} />
                            <span className="text-xs font-medium">{t("var.masked.yes")}</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
                            <EyeOff size={14} className="opacity-60" />
                            <span className="text-xs">{t("var.masked.no")}</span>
                          </div>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {expand ? (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-green-100 text-green-600">
                            <Check size={14} />
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 text-slate-400">
                            <span className="text-xs">—</span>
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200/50 text-blue-600 hover:from-blue-100 hover:to-indigo-200 hover:text-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                            onClick={() => onEdit(v)}
                            title={t("action.edit")}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-red-50 to-rose-100 border border-red-200/50 text-red-600 hover:from-red-100 hover:to-rose-200 hover:text-red-700 transition-all duration-200 shadow-sm hover:shadow-md"
                            onClick={() => onDelete(v)}
                            title={t("action.delete")}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {canShowMore && (
          <div className="px-6 py-5 border-t border-slate-300/60 bg-gradient-to-r from-slate-50/50 to-slate-100/30 flex justify-center shrink-0">
            <button
              type="button"
              className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium text-sm shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 transform hover:-translate-y-0.5"
              onClick={onShowAll}
            >
              {t('var.table.show_all')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
