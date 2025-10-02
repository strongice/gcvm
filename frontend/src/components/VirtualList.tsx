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
    rowHeight: estimatedRowHeight,
    overscan = 4,
    scrollRef,
    className,
    style,
    renderItem,
    emptyPlaceholder = null,
  } = props;

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = React.useState(estimatedRowHeight);
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
    setRowHeight(estimatedRowHeight);
  }, [estimatedRowHeight]);

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

  React.useEffect(() => {
    recompute();
  }, [rowHeight, recompute]);

  React.useLayoutEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const children = Array.from(listEl.children) as HTMLElement[];
    const rowEl = children.find((child) => child.dataset.virtualPad !== 'top' && child.dataset.virtualPad !== 'bottom');
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();
    const style = window.getComputedStyle(rowEl);
    const marginTop = Number.parseFloat(style.marginTop || '0');
    const marginBottom = Number.parseFloat(style.marginBottom || '0');
    const total = rect.height + marginTop + marginBottom;
    if (total > 0 && Math.abs(total - rowHeight) > 1) {
      setRowHeight(total);
    }
  }, [items.length, range.start, range.end, rowHeight]);

  if (items.length === 0) {
    return <div className={className} style={style} ref={listRef}>{emptyPlaceholder}</div>;
  }

  const topPad = range.start * rowHeight;
  const bottomPad = Math.max(0, (items.length - range.end) * rowHeight);
  const slice = items.slice(range.start, range.end);

  return (
    <div ref={listRef} className={className} style={style}>
      <div data-virtual-pad="top" style={{ height: topPad, flexShrink: 0 }} />
      {slice.map((item, idx) => {
        const child = renderItem(item, range.start + idx);
        const key = React.isValidElement(child) && child.key != null ? child.key : range.start + idx;
        return (
          <div key={key as React.Key} data-virtual-row>
            {child}
          </div>
        );
      })}
      <div data-virtual-pad="bottom" style={{ height: bottomPad, flexShrink: 0 }} />
    </div>
  );
}
