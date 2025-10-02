import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../i18n/context";

function useOutsideClose(refs: React.RefObject<HTMLElement>[], onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (refs.every((r) => r.current && !r.current.contains(t))) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [refs, onClose]);
}

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function EnvSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const { t } = useI18n();
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useOutsideClose([anchorRef, popRef], () => setOpen(false));

  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 260 });
  useEffect(() => {
    function place() {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // Используем fixed-позиционирование, поэтому координаты берём из viewport без scroll offsets
      let width = Math.min(r.width, Math.max(220, window.innerWidth - 24));
      let left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
      setPos({ top: r.bottom + 6, left, width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const list = ["*", ...options.filter(Boolean)]
    .filter((n, i, a) => a.indexOf(n) === i)
    .filter((n) => (q ? n.toLowerCase().includes(q.toLowerCase()) : true))
    .slice(0, 50);

  const display = value === '*' ? t('modal.env.all') : value;

  return (
    <>
      <div ref={anchorRef} className="relative">
        <input
          readOnly
          value={display}
          onClick={() => setOpen(true)}
          className="w-[220px] gl-input h-9 leading-9 pr-9 cursor-pointer"
          placeholder={t('modal.env.all')}
          title={t('modal.env.selectTitle')}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600" aria-hidden>
          <ChevronDown size={16} strokeWidth={2.5} />
        </span>
      </div>

      {open && (
        <div
          ref={popRef}
          className="fixed z-50"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="p-2 border-b border-slate-200">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = q.trim() || "*";
                    onChange(v);
                    setOpen(false);
                  }
                }}
                placeholder={t('modal.env.search.placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div className="max-h-[260px] overflow-auto p-1">
              {list.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">{t('modal.env.search.empty')}</div>
              ) : (
                list.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      onChange(n);
                      setOpen(false);
                    }}
                    className={cls("w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50", n === value && "bg-slate-100")}
                    title={n === '*' ? t('modal.env.all') : n}
                  >
                    {n === '*' ? t('modal.env.all') : n}
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-200">
              {t('modal.env.help')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
