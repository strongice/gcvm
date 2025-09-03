import React, { useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (refreshSec: number) => void;
  currentValue: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentValue }) => {
  const [value, setValue] = useState<string>(String(currentValue));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(value);
    if (!isNaN(num) && num > 0) {
      onSave(num);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed left-0 top-0 w-full h-full z-50" style={{ pointerEvents: 'none' }}>
      <div
        className="absolute"
        style={{ left: 'calc(100vw - 340px)', top: '60px', pointerEvents: 'auto' }}
      >
        <div className="modal bg-white p-6 rounded-xl shadow-xl max-w-md w-[320px]">
          <h2 className="text-lg font-bold mb-4">Настройки</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1">Скорость автообновления (секунды)</label>
              <input
                type="number"
                min={1}
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <div className="text-xs text-slate-500 mt-1">Текущее значение: <b>{currentValue}</b> сек.</div>
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg" disabled={value === '' || Number(value) < 1} title="Сохранить настройки">Сохранить</button>
              <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg" title="Закрыть без сохранения">Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
