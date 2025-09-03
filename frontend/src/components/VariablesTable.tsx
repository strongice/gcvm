import React from "react";
import type { VarSummary } from "../types";
import { Eye, EyeOff, Shield, Expand } from "lucide-react";

export function VariablesTable(props: {
  vars: VarSummary[];
  loading: boolean;
  error: string | null;
  onEdit: (v: VarSummary) => void;
  hasContext: boolean;
  titleText: string;
}) {
  const { vars, loading, error, onEdit, hasContext, titleText } = props;

  return (
    <section className="flex-1 p-3">
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <div className="text-base font-semibold">{titleText}</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-slate-600 [&>th]:border-b [&>th]:border-slate-200">
                <th>КЛЮЧ</th>
                <th>ТИП</th>
                <th>ОКРУЖЕНИЕ</th>
                <th>ЗАЩИЩЁННАЯ</th>
                <th>МАСКИРОВАННАЯ</th>
                <th>EXPAND</th>
                <th>ДЕЙСТВИЯ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={7}>
                    Загрузка…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="py-8 text-center text-amber-600" colSpan={7}>
                    {error}
                  </td>
                </tr>
              ) : vars.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={7}>
                    {hasContext ? "Нет переменных" : "Выберите группу или проект слева"}
                  </td>
                </tr>
              ) : (
                vars.map((v) => {
                  const expand = !(v.raw === true);
                  return (
                    <tr key={`${v.key}|${v.environment_scope}`} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-slate-100">
                      <td className="font-mono text-[12px]">{v.key}</td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-slate-200 bg-slate-50">
                          {v.variable_type || 'env_var'}
                        </span>
                      </td>
                      <td>{v.environment_scope || "*"}</td>
                      <td>
                        {v.protected ? (
                          <Shield size={16} className="text-emerald-600" aria-label="Protected" />
                        ) : (
                          <span className="text-slate-300">–</span>
                        )}
                      </td>
                      <td>
                        {v.masked ? (
                          <EyeOff size={16} className="text-amber-600" aria-label="Masked" />
                        ) : (
                          <Eye size={16} className="text-slate-500" aria-label="Visible" />
                        )}
                      </td>
                      <td>
                        {expand ? (
                          <Expand size={16} className="text-sky-700" aria-label="Expand enabled" />
                        ) : (
                          <span className="text-slate-300">–</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                          onClick={() => onEdit(v)}
                        >
                          Редактировать
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
