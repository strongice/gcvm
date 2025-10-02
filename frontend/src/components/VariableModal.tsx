import React, { useEffect, useRef, useState } from "react";
import type { VarEditing } from "../types";
import { EnvSelect } from "./EnvSelect";
import TypeSelect from "./TypeSelect";
import { X, CircleHelp } from "lucide-react";
import { useI18n } from "../i18n/context";

export function VariableModal(props: {
  open: boolean;
  onClose: () => void;
  initial: VarEditing | null;
  envOptions: string[];
  onSave: (draft: VarEditing) => Promise<void> | void;
  error?: string;
}) {
  const { open, onClose, initial, envOptions, onSave, error } = props;
  const { t } = useI18n();
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
      errs.push(t('modal.validation.masked.length'));
    }
    // 2) Допустимые символы (для env_var). Для file не навязываем, чтобы не блокировать многострочные файлы
    const isFile = draft.variable_type === 'file';
    if (!isFile) {
      const allowed = /^[a-zA-Z0-9_@:+\/=.\-]+$/;
      if (val && !allowed.test(val)) {
        errs.push(t('modal.validation.masked.allowed'));
      }
    }
    return { ok: errs.length === 0, errors: errs };
  })();

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
        <div className={"w-[96vw] h-[90vh] sm:w-[95vw] sm:h-[85vh] max-w-[100vw] max-h-[100vh] min-w-[320px] min-h-[260px] resize overflow-hidden flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl relative"}>
          {/* Close button in top-right corner */}
          <button
            className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
            aria-label={t('modal.close')}
            title={t('modal.close')}
          >
            <X size={16} />
          </button>
          {/* header */}
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between pr-14">
            <div className="text-lg font-semibold">
              {isEditing
                ? `${t('modal.variable.edit')}: ${draft.key || (initial as any)?.__originalKey || ''}`
                : `${t('modal.variable.create')}: ${draft.key || ''}`}
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
                  <span className="text-slate-600">{t('modal.field.key')}</span>
                  <input
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                    className="w-full gl-input"
                    placeholder="KEY"
                  />
                </label>

                <div className="inline-flex items-center gap-2">
                  <span className="text-slate-600">{t('modal.field.environment')}</span>
                  <EnvSelect
                    value={draft.environment_scope}
                    options={envOptions}
                    onChange={(val) =>
                      setDraft({ ...draft, environment_scope: val })
                    }
                  />
                </div>

                <label className="inline-flex items-center gap-2">
                  <span className="text-slate-600">{t('modal.field.type')}</span>
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
                  <div className="text-slate-600 mb-2">{t('modal.field.visibility')}</div>
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
                        <span>{t('modal.visibility.visible')}</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">{t('modal.visibility.visibleHint')}</div>
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
                        <span>{t('modal.visibility.masked')}</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">{t('modal.visibility.maskedHint')}</div>
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
                        <span>{t('modal.visibility.hidden')}</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">{t('modal.visibility.hiddenHint')}</div>
                    </label>
                  </div>
                </div>

                {/* Flags */}
                <div>
                  <div className="inline-flex items-center gap-1 text-slate-600 mb-2">
                    <span>{t('modal.field.flags')}</span>
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
                        <span>{t('modal.flag.protected')}</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">{t('modal.flag.protectedHint')}</div>
                    </label>

                    <label className="block" title="raw=false when checked">
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={!(draft.raw === true)}
                          onChange={(e) => setDraft({ ...draft, raw: !e.target.checked })}
                        />
                        <span>{t('modal.flag.expand')}</span>
                      </span>
                      <div className="text-xs text-slate-500 ml-6">{t('modal.flag.expandHint')}</div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Value */}
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <div className="text-sm text-slate-600">{t('modal.field.value')}</div>
                <textarea
                  ref={textRef}
                  value={draft.value ?? ""}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  className="flex-1 min-h-[200px] w-full max-w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-300/60 overflow-auto resize-y"
                  style={{ WebkitOverflowScrolling: 'touch' as any }}
                  placeholder={t('modal.placeholder.value')}
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
                title={t('modal.actions.cancelTitle')}
              >
                {t('action.cancel')}
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
                title={(!maskedValidation.ok && (draft.masked || draft.hidden)) ? t('modal.actions.saveBlocked') : t('modal.actions.saveTitle')}
              >
                {t('action.save')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
