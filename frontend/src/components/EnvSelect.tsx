import React, { useEffect, useRef, useState } from "react";

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
      setPos({ top: r.bottom + 6 + window.scrollY, left: r.left + window.scrollX, width: r.width });
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

  return (
    <>
      <div ref={anchorRef} className="relative">
        <input
          readOnly
          value={value}
          onClick={() => setOpen(true)}
          className="w-[220px] px-3 py-2 rounded-xl border border-slate-300 bg-white cursor-pointer"
          placeholder="*"
          title="Нажмите чтобы выбрать окружение или начните ввод в выпадающем поиске"
        />
        <span className="pointer-events-none absolute right-3 top-2.5 text-slate-500" aria-hidden>
          ▾
        </span>
      </div>

      {open && (
        <div
          ref={popRef}
          className="absolute z-50"
          style={{ position: "absolute", top: pos.top, left: pos.left, width: pos.width }}
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
                placeholder="Поиск окружения…"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div className="max-h-[260px] overflow-auto p-1">
              {list.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">Ничего не найдено</div>
              ) : (
                list.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      onChange(n);
                      setOpen(false);
                    }}
                    className={cls("w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50", n === value && "bg-slate-100")}
                  >
                    {n}
                  </button>
                ))
              )}
            </div>
            <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-200">
              Можно ввести новое окружение, или * для wildcard. Нажмите Enter.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
