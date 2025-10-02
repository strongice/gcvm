import React from "react";
import { useI18n, SUPPORTED_LOCALES } from "../i18n/context";
import { Locale } from "../i18n/messages";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, locale, setLocale } = useI18n();

  if (!isOpen) return null;

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
  };

  return (
    <div className="fixed left-0 top-0 w-full h-full z-50" style={{ pointerEvents: 'none' }}>
      <div
        className="absolute"
        style={{ left: 'calc(100vw - 340px)', top: '60px', pointerEvents: 'auto' }}
      >
        <div className="modal bg-white p-6 rounded-xl shadow-xl max-w-md w-[320px]">
          <h2 className="text-lg font-bold mb-4">{t('settings.title')}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">{t('settings.language.label')}</label>
              <select
                className="w-full px-3 py-2 border rounded-lg bg-white"
                value={locale}
                onChange={(e) => handleLocaleChange(e.target.value as Locale)}
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc === 'ru' ? t('settings.language.russian') : t('settings.language.english')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg" title={t('action.close')}>
              {t('action.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
