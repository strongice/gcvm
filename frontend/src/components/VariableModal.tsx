import React, { useEffect, useState } from "react";
import type { VarEditing } from "../types";
import { EnvSelect } from "./EnvSelect";

export function VariableModal(props: {
  open: boolean;
  onClose: () => void;
  initial: VarEditing | null;
  envOptions: string[];
  onSave: (draft: VarEditing) => Promise<void> | void;
}) {
  const { open, onClose, initial, envOptions, onSave } = props;
  const [draft, setDraft] = useState<VarEditing | null>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
  }, [initial, open]);

  if (!open || !draft) return null;

  const lockedHidden = !!draft.hidden; // если уже hidden — режим менять нельзя

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-[1100px] w-[95vw] max-h-[88vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
          {/* header */}
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="text-lg font-semibold">
              {draft.key ? `Редактирование ${draft.key}` : "Создание переменной"}
            </div>
            <button
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
              onClick={onClose}
              disabled={saving}
            >
              ✕
            </button>
          </div>

          {/* body */}
          <div className="p-5 overflow-auto flex-1 min-w-0">
            <div className="space-y-5">
              {/* Row: Key & Environment */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2">
                  <span className="text-slate-600 w-20">Key</span>
                  <input
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                    className="w-[360px] max-w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    placeholder="KEY"
                  />
                </label>

                <div className="inline-flex items-center gap-2">
                  <span className="text-slate-600">Environment</span>
                  <EnvSelect
                    value={draft.environment_scope}
                    options={envOptions}
                    onChange={(val) =>
                      setDraft({ ...draft, environment_scope: val })
                    }
                  />
                </div>
              </div>

              {/* Visibility */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">Visibility:</span>

                  {/* Visible */}
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="vis"
                      checked={!draft.masked && !draft.hidden}
                      onChange={() => setDraft({ ...draft, masked: false, hidden: false })}
                      disabled={lockedHidden}
                    />
                    Visible
                  </label>

                  {/* Masked */}
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="vis"
                      checked={draft.masked && !draft.hidden}
                      onChange={() => setDraft({ ...draft, masked: true, hidden: false })}
                      disabled={lockedHidden}
                    />
                    Masked
                  </label>

                  {/* Masked and hidden */}
                  <label
                    className="inline-flex items-center gap-1"
                    title="Значение нельзя будет раскрыть в UI после сохранения"
                  >
                    <input
                      type="radio"
                      name="vis"
                      checked={!!draft.hidden}
                      onChange={() => setDraft({ ...draft, masked: true, hidden: true })}
                      // если уже hidden — оставляем включённым и блокируем
                      disabled={lockedHidden}
                    />
                    Masked and hidden
                  </label>
                </div>
              </div>

              {/* Flags */}
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-slate-600">Flags:</span>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.protected}
                    onChange={(e) =>
                      setDraft({ ...draft, protected: e.target.checked })
                    }
                  />
                  Protect variable
                </label>

                <label className="inline-flex items-center gap-2" title="raw=false when checked">
                  <input
                    type="checkbox"
                    checked={!(draft.raw === true)}
                    onChange={(e) =>
                      setDraft({ ...draft, raw: !e.target.checked })
                    }
                  />
                  Expand variable reference
                </label>
              </div>

              {/* Value */}
              <div className="space-y-2">
                <div className="text-sm text-slate-600">Value</div>
                <textarea
                  value={draft.value ?? ""}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  className="w-full max-w-full h-[48vh] min-h-[220px] rounded-2xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-300/60 overflow-auto resize-y"
                  placeholder=".env / file content"
                />
                {lockedHidden && (
                  <div className="text-xs text-slate-500">
                    Значение скрыто (hidden). В ответах API оно не показывается. Чтобы изменить — введите новое значение.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                onClick={onClose}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(draft);
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

