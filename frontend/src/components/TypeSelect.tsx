import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../i18n/context";

function useOutsideClose(refs: React.RefObject<HTMLElement>[], onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (refs.every((r) => r.current && !r.current.contains(t))) onClose();
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, [refs, onClose]);
}

export function TypeSelect({
  value,
  onChange,
}: {
  value: "variables" | "file";
  onChange: (v: "variables" | "file") => void;
}) {
  const { t } = useI18n();
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useOutsideClose([anchorRef, popRef], () => setOpen(false));

  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 260 });
  useEffect(() => {
    function place() {
      const a = anchorRef.current; if (!a) return;
      const r = a.getBoundingClientRect();
      let width = Math.min(r.width, Math.max(220, window.innerWidth - 24));
      let left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
      setPos({ top: r.bottom + 6, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  const label = value === "file" ? t('modal.type.file') : t('modal.type.variable');

  return (
    <>
      <div ref={anchorRef} className="relative">
        <input
          readOnly
          value={label}
          onClick={() => setOpen(true)}
          className="w-[260px] gl-input h-9 leading-9 pr-9 cursor-pointer"
          placeholder={t('modal.type.placeholder')}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600" aria-hidden>
          <ChevronDown size={16} strokeWidth={2.5} />
        </span>
      </div>

      {open && (
        <div ref={popRef} className="fixed z-50" style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}>
          <div className="rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="max-h-[220px] overflow-auto p-1">
              {(["variables", "file"] as const).map((n) => (
                <button
                  type="button"
                  key={n}
                  onMouseDown={(e) => { e.preventDefault(); onChange(n); setOpen(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onChange(n);
                      setOpen(false);
                    }
                  }}
                  className={("w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 ") + (n === value ? "bg-slate-100" : "")}
                  title={n === 'file' ? t('modal.type.title.file') : t('modal.type.title.variable')}
                >
                  {n === "file" ? t('modal.type.file') : t('modal.type.variable')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TypeSelect;
