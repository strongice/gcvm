import React from "react";
import type { VarSummary } from "../types";

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
    <section className="flex-1 p-4">
      <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="text-base font-semibold">{titleText}</div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-left [&>th]:text-slate-600 [&>th]:border-b [&>th]:border-slate-200">
                <th>КЛЮЧ</th>
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
                  <td className="py-8 text-center text-slate-500" colSpan={6}>
                    Загрузка…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="py-8 text-center text-amber-600" colSpan={6}>
                    {error}
                  </td>
                </tr>
              ) : vars.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-500" colSpan={6}>
                    {hasContext ? "Нет file-переменных" : "Выберите группу или проект слева"}
                  </td>
                </tr>
              ) : (
                vars.map((v) => {
                  const expand = !(v.raw === true);
                  return (
                    <tr key={`${v.key}|${v.environment_scope}`} className="[&>td]:py-2 [&>td]:px-3 [&>td]:border-b [&>td]:border-slate-100">
                      <td className="font-mono text-[12px]">{v.key}</td>
                      <td>{v.environment_scope || "*"}</td>
                      <td>{v.protected ? "✓" : ""}</td>
                      <td>{v.masked ? "✓" : ""}</td>
                      <td>{expand ? "✓" : ""}</td>
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