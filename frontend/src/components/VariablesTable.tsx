import React from "react";
import type { VarSummary } from "../types";
import { EyeOff, Shield, ShieldOff, Pencil, Check } from "lucide-react";

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
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
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
                <th>РАЗВЕРНУТЬ</th>
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
                    <tr key={`${v.key}|${v.environment_scope}`} className="hover:bg-slate-50 transition-colors [&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-slate-100">
                      <td className="font-mono text-[12px]">{v.key}</td>
                      <td>
                        <span className="inline-flex items-center gl-badge">
                          {v.variable_type === 'env_var' ? 'variables' : (v.variable_type || 'variables')}
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-xs">
                          {v.environment_scope || "*"}
                        </span>
                      </td>
                      <td>
                        {v.protected ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <Shield size={16} /> Да
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <ShieldOff size={16} /> Нет
                          </span>
                        )}
                      </td>
                      <td>
                        {v.masked ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <EyeOff size={16} /> Да
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <EyeOff size={16} className="opacity-40" /> Нет
                          </span>
                        )}
                      </td>
                      <td>
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
                          title="Открыть редактор переменной"
                        >
                          <Pencil size={16} /> Редактировать
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
