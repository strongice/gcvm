import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n, SUPPORTED_LOCALES } from "../i18n/context";
import { Locale } from "../i18n/messages";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LocaleSelectProps {
  value: Locale;
  options: Locale[];
  getLabel: (loc: Locale) => string;
  onChange: (loc: Locale) => void;
}

const LocaleSelect: React.FC<LocaleSelectProps> = ({ value, options, getLabel, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (loc: Locale) => {
    onChange(loc);
    setIsOpen(false);
  };

  return (
    <div className="relative" onMouseDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative w-full gl-input flex items-center justify-between gap-3 pr-12 rounded-xl bg-white border border-slate-300/70 shadow-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all duration-200 text-sm font-medium text-slate-700"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{getLabel(value)}</span>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.213l3.71-3.982a.75.75 0 111.08 1.04l-4.24 4.548a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute left-0 top-full mt-2 w-full rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-300/30 overflow-hidden z-50"
          role="listbox"
        >
          {options.map((loc) => {
            const isActive = loc === value;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => handleSelect(loc)}
                className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                }`}
                role="option"
                aria-selected={isActive}
              >
                {getLabel(loc)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, locale, setLocale } = useI18n();

  if (!isOpen) return null;

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const localeLabel = useMemo(
    () =>
      (loc: Locale) =>
        loc === "ru" ? t("settings.language.russian") : t("settings.language.english"),
    [t]
  );

  return (
    <div
      className="fixed left-0 top-0 w-full h-full z-50"
      onMouseDown={() => onClose()}
    >
      <div
        className="absolute"
        style={{ left: 'calc(100vw - 360px)', top: '64px' }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="bg-white rounded-3xl border border-slate-300/70 shadow-xl shadow-slate-300/25 overflow-hidden backdrop-blur-sm w-[340px]">
          <div className="px-6 py-4 border-b border-slate-300/60 bg-gradient-to-r from-blue-50 via-indigo-50/30 to-purple-50/20">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{t('settings.title')}</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">{t('settings.language.label')}</label>
              <LocaleSelect
                value={locale}
                options={SUPPORTED_LOCALES}
                getLabel={localeLabel}
                onChange={handleLocaleChange}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-300/60 bg-gradient-to-r from-slate-50/50 to-slate-100/30 flex justify-end">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-5 py-2.5 rounded-xl border border-slate-300/60 bg-gradient-to-r from-white to-slate-50 hover:from-slate-50 hover:to-slate-100 text-slate-700 font-medium shadow-sm hover:shadow-md transition-all duration-200" 
              title={t('action.close')}
            >
              {t('action.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
