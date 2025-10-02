import React from "react";

function computeOffsetTop(node: HTMLElement | null, ancestor: HTMLElement | null): number {
  let offset = 0;
  let current: HTMLElement | null = node;
  while (current && current !== ancestor) {
    offset += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return offset;
}

type VirtualListProps<T> = {
  items: readonly T[];
  rowHeight: number;
  overscan?: number;
  scrollRef: React.RefObject<HTMLElement>;
  className?: string;
  style?: React.CSSProperties;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyPlaceholder?: React.ReactNode;
};

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    rowHeight,
    overscan = 4,
    scrollRef,
    className,
    style,
    renderItem,
    emptyPlaceholder = null,
  } = props;

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [range, setRange] = React.useState({ start: 0, end: Math.min(items.length, overscan * 2) });

  const recompute = React.useCallback(() => {
    const scrollEl = scrollRef.current;
    const listEl = listRef.current;
    if (!scrollEl || !listEl) {
      setRange({ start: 0, end: Math.min(items.length, overscan * 2) });
      return;
    }

    const relativeTop = computeOffsetTop(listEl, scrollEl);
    const rawScroll = scrollEl.scrollTop - relativeTop;
    const scroll = rawScroll > 0 ? rawScroll : 0;
    const viewport = scrollEl.clientHeight || 0;
    const start = Math.max(0, Math.floor(scroll / rowHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((scroll + viewport) / rowHeight) + overscan);
    setRange({ start, end });
  }, [items.length, overscan, rowHeight, scrollRef]);

  React.useEffect(() => {
    setRange((prev) => {
      const start = 0;
      const end = Math.min(items.length, Math.max(prev.end, overscan * 2));
      return { start, end };
    });
    recompute();
  }, [items.length, overscan, recompute]);

  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const handler = () => recompute();
    scrollEl.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    return () => {
      scrollEl.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
    };
  }, [recompute, scrollRef]);

  React.useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(listEl);
    return () => observer.disconnect();
  }, [recompute]);

  if (items.length === 0) {
    return <div className={className} style={style} ref={listRef}>{emptyPlaceholder}</div>;
  }

  const topPad = range.start * rowHeight;
  const bottomPad = Math.max(0, (items.length - range.end) * rowHeight);
  const slice = items.slice(range.start, range.end);

  return (
    <div ref={listRef} className={className} style={style}>
      <div style={{ height: topPad }} />
      {slice.map((item, idx) => renderItem(item, range.start + idx))}
      <div style={{ height: bottomPad }} />
    </div>
  );
}

