import React, { useEffect, useRef, useState } from "react";
import type { VarEditing } from "../types";
import { EnvSelect } from "./EnvSelect";
import TypeSelect from "./TypeSelect";
import { X, CircleHelp } from "lucide-react";

export function VariableModal(props: {
  open: boolean;
  onClose: () => void;
  initial: VarEditing | null;
  envOptions: string[];
  onSave: (draft: VarEditing) => Promise<void> | void;
  error?: string;
}) {
  const { open, onClose, initial, envOptions, onSave, error } = props;
  const [draft, setDraft] = useState<VarEditing | null>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial);
  }, [initial, open]);

  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // авто-изменение высоты textarea под контент, чтобы занимать доступное пространство
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // ограничим разумной величиной, остальное прокрутит модалка целиком
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.6)) + 'px';
  }, [open, draft?.value]);

  if (!open || !draft) return null;
  const isEditing = Boolean((initial as any)?.__originalKey);

  // Блокируем переключение Hidden только если переменная ИЗНАЧАЛЬНО была hidden (редактирование существующей)
  const lockedHidden = !!(initial?.hidden && (initial as any)?.__originalKey);

  // Валидация значений для маскированных переменных (похоже на поведение GitLab)
  const maskedValidation = (() => {
    const errs: string[] = [];
    if (!(draft.masked || draft.hidden)) return { ok: true, errors: errs };
    const val = draft.value ?? "";
    // 1) Минимальная длина 8 символов
    if ((val || "").length < 8) {
      errs.push("Значение должно содержать не менее 8 символов для маскированной переменной.");
    }
    // 2) Допустимые символы (для env_var). Для file не навязываем, чтобы не блокировать многострочные файлы
    const isFile = draft.variable_type === 'file';
    if (!isFile) {
      const allowed = /^[a-zA-Z0-9_@:+\/=.\-]+$/;
      if (val && !allowed.test(val)) {
        errs.push("Разрешены только буквы, цифры и символы _ @ : + - = / .");
      }
    }
    return { ok: errs.length === 0, errors: errs };
  })();

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={"w-[95vw] h-[85vh] max-w-[100vw] max-h-[100vh] min-w-[320px] min-h-[260px] resize overflow-hidden flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl relative"}>
          {/* Close button in top-right corner */}
          <button
            className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
          {/* header */}
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between pr-14">
            <div className="text-lg font-semibold">
              {isEditing ? `Редактирование: ${draft.key || (initial as any)?.__originalKey || ''}` : `Создание переменной: ${draft.key || ''}`}
            </div>
          </div>

          {error && (
            <div className="px-5 py-2 bg-rose-50 text-rose-700 border-b border-rose-200 text-sm">
              {error}
            </div>
          )}

          {/* body */}
          <div className="p-5 overflow-auto flex-1 min-w-0 flex flex-col">
            <div className="flex flex-col gap-5 h-full min-h-0">
              {/* Строка: Ключ, Окружение, Тип */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 flex-1 min-w-[240px] max-w-[520px]">
                  <span className="text-slate-600">Ключ</span>
                  <input
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                    className="w-full gl-input"
                    placeholder="KEY"
                  />
                </label>

                <div className="inline-flex items-center gap-2">
                  <span className="text-slate-600">Окружение</span>
                  <EnvSelect
                    value={draft.environment_scope}
                    options={envOptions}
                    onChange={(val) =>
                      setDraft({ ...draft, environment_scope: val })
                    }
                  />
                </div>

                <label className="inline-flex items-center gap-2">
                  <span className="text-slate-600">Тип</span>
                  <TypeSelect
                    value={(draft.variable_type === 'env_var' ? 'variables' : (draft.variable_type as any)) || 'file'}
                    onChange={(v) => setDraft({ ...draft, variable_type: v })}
                  />
                </label>
              </div>

              {/* Visibility + Flags side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* Visibility */}
                <div>
                  <div className="text-slate-600 mb-2">Видимость</div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          className="accent-blue-600"
                          name="vis"
                          checked={!draft.masked && !draft.hidden}
                          onChange={() => setDraft({ ...draft, masked: false, hidden: false })}
                          disabled={lockedHidden}
                        />
                        <span>Видимая</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">Значение видно в логах job'ов.</div>
                    </label>

                    <label className="block">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          className="accent-blue-600"
                          name="vis"
                          checked={draft.masked && !draft.hidden}
                          onChange={() => setDraft({ ...draft, masked: true, hidden: false })}
                          disabled={lockedHidden}
                        />
                        <span>Маскируемая</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">Значение маскируется в логах, но может быть раскрыто в настройках CI/CD. Требует соответствия регулярным выражениям.</div>
                    </label>

                    <label className="block">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          className="accent-blue-600"
                          name="vis"
                          checked={!!draft.hidden}
                          onChange={() => setDraft({ ...draft, masked: true, hidden: true })}
                          disabled={lockedHidden}
                        />
                        <span>Маскируемая и скрытая</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">Значение маскируется в логах и не может быть раскрыто в настройках CI/CD после сохранения.</div>
                    </label>
                  </div>
                </div>

                {/* Flags */}
                <div>
                  <div className="inline-flex items-center gap-1 text-slate-600 mb-2">
                    <span>Флаги</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={draft.protected}
                          onChange={(e) => setDraft({ ...draft, protected: e.target.checked })}
                        />
                        <span>Защитить переменную</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">Экспортировать переменную только в пайплайны защищённых веток и тегов.</div>
                    </label>

                    <label className="block" title="raw=false when checked">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={!(draft.raw === true)}
                          onChange={(e) => setDraft({ ...draft, raw: !e.target.checked })}
                        />
                        <span>Разворачивать ссылки на переменные</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">Символ $ считается началом ссылки на другую переменную.</div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Value */}
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <div className="text-sm text-slate-600">Значение</div>
                <textarea
                  ref={textRef}
                  value={draft.value ?? ""}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  className="flex-1 min-h-[200px] w-full max-w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-300/60 overflow-hidden resize-y"
                  placeholder=".env / file content"
                />
                { (draft.masked || draft.hidden) && maskedValidation.errors.length > 0 && (
                  <div className="text-xs text-rose-600 space-y-1">
                    {maskedValidation.errors.map((m, i) => (
                      <div key={i}>{m}</div>
                    ))}
                  </div>
                )}
                {/* Информационный блок про hidden не показываем по требованию */}
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
                disabled={saving || (!maskedValidation.ok && (draft.masked || draft.hidden))}
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
