"use client";

import { useEffect, useRef, useState } from "react";

// Shared "constrain to a single row + show a +N more expander" measurement.
//
// Render a hidden measure layer (a single-line flex-nowrap row) into `measureRef`
// laid out as: [optional leading nodes] + every item + a "+N more" sentinel as
// the LAST child. This hook reads the measured geometry and returns how many
// items fit on one row once room is reserved for the sentinel. The caller then
// shows `items.slice(0, visibleCount)` plus the expander.
//
// `leadingCount` is the number of non-item children at the FRONT of the measure
// layer (e.g. a group label) — they're skipped when counting items but their
// width is still respected (item offsetLeft already includes them).
//
// `signature` should change whenever item content/size changes (not just count),
// so we re-measure on relabel/resize-of-content; a ResizeObserver covers
// container resizes on its own.
export function useOneRowFit(
  itemCount: number,
  enabled: boolean,
  opts?: { leadingCount?: number; signature?: string },
): { measureRef: React.RefObject<HTMLDivElement | null>; visibleCount: number } {
  const leadingCount = opts?.leadingCount ?? 0;
  const signature = opts?.signature ?? "";
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  // This effect synchronizes React state with measured DOM layout — the
  // legitimate "read from an external system" use of an effect. The setState
  // calls are deliberately synchronous (measure before paint to avoid a flash of
  // all pills), so the set-state-in-effect rule is disabled within it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enabled || itemCount === 0) {
      setVisibleCount(itemCount);
      return;
    }
    const node = measureRef.current;
    if (!node) return;
    const GAP = 6; // matches gap-1.5
    const measure = () => {
      const children = Array.from(node.children) as HTMLElement[];
      if (children.length < leadingCount + 2) return; // need items + sentinel
      const sentinel = children[children.length - 1]!;
      const items = children.slice(leadingCount, -1);
      if (items.length === 0) return;
      const containerW = node.clientWidth;
      if (containerW === 0) return; // not laid out yet; ResizeObserver re-fires
      const last = items[items.length - 1]!;
      // Everything fits → show all, no expander.
      if (last.offsetLeft + last.offsetWidth <= containerW + 1) {
        setVisibleCount(items.length);
        return;
      }
      // Otherwise reserve room for the "+N more" sentinel and fit what we can.
      const budget = containerW - sentinel.offsetWidth - GAP;
      let count = 0;
      for (const p of items) {
        if (p.offsetLeft + p.offsetWidth <= budget) count++;
        else break;
      }
      setVisibleCount(Math.max(1, count)); // always show ≥1 when overflowing
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [enabled, itemCount, leadingCount, signature]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { measureRef, visibleCount };
}
