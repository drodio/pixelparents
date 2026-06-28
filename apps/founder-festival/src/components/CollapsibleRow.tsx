"use client";

import { useState, type ReactNode } from "react";
import { useOneRowFit } from "@/components/use-one-row-fit";

// Generic "one row + +N more" row for pill-style content that isn't a Badge
// (e.g. the profile's purple family/Personal pills). Renders an optional leading
// label, the items that fit on one row, and a "+N more" pill that expands the
// row inline to show everything (with a "less" to re-collapse). For real
// achievement badges use <Badges collapsible /> instead.
const SENTINEL = "inline-flex items-center rounded-md border font-medium whitespace-nowrap px-2.5 py-1 text-xs";

export function CollapsibleRow({
  label,
  items,
  signature,
}: {
  label?: ReactNode;
  items: ReactNode[];
  // Changes when item content changes (not just count), to force a re-measure.
  signature?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const leadingCount = label ? 1 : 0;
  const { measureRef, visibleCount } = useOneRowFit(items.length, !expanded, {
    leadingCount,
    signature: signature ?? String(items.length),
  });

  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, visibleCount);
  const hiddenCount = expanded ? 0 : items.length - visibleCount;

  return (
    <div className="relative w-full max-w-full">
      {/* Hidden measure layer: label + ALL items on one nowrap line + sentinel. */}
      <div
        ref={measureRef}
        aria-hidden
        // `inert` keeps the duplicated measure-layer items (which include real
        // <a> links) out of the tab order + a11y tree, not just pointer events.
        inert
        className="invisible absolute inset-x-0 top-0 flex flex-nowrap items-center gap-1.5 pointer-events-none whitespace-nowrap overflow-hidden"
      >
        {label}
        {items}
        <span className={`${SENTINEL} border-zinc-700`}>+{items.length} more</span>
      </div>
      <div
        className={
          expanded
            ? "flex flex-wrap items-center gap-1.5"
            : "flex flex-nowrap items-center gap-1.5 overflow-hidden"
        }
      >
        {label}
        {visible}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`Show ${hiddenCount} more`}
            className={`${SENTINEL} border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors cursor-pointer`}
          >
            +{hiddenCount} more
          </button>
        )}
        {expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={`${SENTINEL} border-transparent text-zinc-500 hover:text-zinc-300 cursor-pointer`}
            aria-label="Collapse"
          >
            less
          </button>
        )}
      </div>
    </div>
  );
}
