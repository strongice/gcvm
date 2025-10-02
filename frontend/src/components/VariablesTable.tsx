import React from "react";
import type { VarSummary } from "../types";
import { EyeOff, Shield, ShieldOff, Pencil, Check } from "lucide-react";
import { useI18n } from "../i18n/context";

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function VariablesTable(props: {
  vars: VarSummary[];
  loading: boolean;
  error: string | null;
  onEdit: (v: VarSummary) => void;
  hasContext: boolean;
  titleText: string;
  visibleCount: number;
  onShowAll?: () => void;
}) {
  const { vars, loading, error, onEdit, hasContext, titleText, visibleCount, onShowAll } = props;
  const { t } = useI18n();
  const effectiveCount = Number.isFinite(visibleCount) ? Math.max(visibleCount, 0) : 0;
  const visibleItems = vars.slice(0, effectiveCount);
  const canShowMore = Boolean(!loading && !error && onShowAll && vars.length > visibleItems.length);

  return (
    <section className="flex-1 p-4">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-gradient-to-r from-blue-50/60 to-transparent">
          <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-blue-100 text-blue-600">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M2.5 2h11a.5.5 0 01.5.5v11l-3-2-3 2-3-2-3 2v-11a.5.5 0 01.5-.5z"/></svg>
          </div>
          <div className="text-lg font-semibold text-slate-800">{titleText}</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-slate-600 [&>th]:border-b [&>th]:border-slate-200">
                <th>{t("var.table.key")}</th>
                <th className="hidden md:table-cell">{t("var.table.type")}</th>
                <th>{t("var.table.env")}</th>
                <th className="hidden md:table-cell">{t("var.table.protected")}</th>
                <th className="hidden md:table-cell">{t("var.table.masked")}</th>
                <th className="hidden md:table-cell">{t("var.table.expand")}</th>
                <th>{t("var.table.actions")}</th>
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
                        "transition-colors [&>td]:py-2.5 [&>td]:px-3 [&>td]:border-b [&>td]:border-slate-100",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                        "hover:bg-blue-50/40"
                      )}
                    >
                      <td className="font-mono text-[12px]">{v.key}</td>
                      <td className="hidden md:table-cell">
                        <span className="inline-flex items-center gl-badge">
                          {v.variable_type === 'env_var' ? 'variables' : (v.variable_type || 'variables')}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-xs">
                          {v.environment_scope || "*"}
                        </span>
                      </td>
                      <td className="hidden md:table-cell">
                        {v.protected ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <Shield size={16} /> {t("var.protected.yes")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <ShieldOff size={16} /> {t("var.protected.no")}
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {v.masked ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <EyeOff size={16} /> {t("var.masked.yes")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <EyeOff size={16} className="opacity-40" /> {t("var.masked.no")}
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell">
                        {expand ? (
                          <Check size={16} className="text-slate-700" />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-white"
                          onClick={() => onEdit(v)}
                          title={t("var.table.edit")}
                        >
                          <Pencil size={16} />
                          <span className="hidden sm:inline">{t("action.edit")}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {canShowMore && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-center">
            <button
              type="button"
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
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
