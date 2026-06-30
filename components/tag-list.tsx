"use client";

import { useId, useState, type ReactNode } from "react";
import { tagListView, DEFAULT_TAG_MAX } from "@/lib/tag-list";

// A reusable, accessible tag/chip strip that shows only the first `max` chips and
// collapses the rest behind a "+N more" toggle. Clicking the toggle expands the
// list inline (pushing the page down) and can collapse it again. Keyboard- and
// screen-reader-accessible: the toggle is a real <button> with aria-expanded.
//
// Presentational by design — the caller owns what each chip looks like and does
// (a plain pill, or a clickable filter chip with its own onClick). Pass a
// `renderTag` to control chip rendering; otherwise a default amber/white pill is
// rendered (matching the directory/board chip style).

const DEFAULT_CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs text-white/80";

export function TagList({
  tags,
  max = DEFAULT_TAG_MAX,
  className,
  chipClassName,
  renderTag,
  moreLabel,
  toggleClassName,
}: {
  tags: string[];
  /** How many chips to show before collapsing the rest. Default ~6. */
  max?: number;
  /** Wrapper class for the chip row (defaults to a flex-wrap gap row). */
  className?: string;
  /** Class applied to the default pill chip. Ignored when `renderTag` is given. */
  chipClassName?: string;
  /**
   * Render a single tag. Lets callers emit a clickable filter chip (keeping their
   * own onClick) or any custom node. When omitted, a plain amber/white pill is used.
   */
  renderTag?: (tag: string, index: number) => ReactNode;
  /** Override the "+N more" / "Show less" button classes. */
  toggleClassName?: string;
  /** Custom builder for the "more" button label (default: "+N more"). */
  moreLabel?: (hiddenCount: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const { shown, hiddenCount, hasOverflow } = tagListView(tags, max, expanded);

  if (tags.length === 0) return null;

  const renderChip =
    renderTag ??
    ((tag: string) => (
      <span key={tag} className={chipClassName ?? DEFAULT_CHIP_CLASS}>
        {tag}
      </span>
    ));

  return (
    <div className={className ?? "flex flex-wrap items-center gap-1.5"} id={regionId}>
      {shown.map((tag, i) => renderChip(tag, i))}
      {hasOverflow && (
        <button
          type="button"
          onClick={(e) => {
            // The chip strip is sometimes nested inside a clickable card/<Link>;
            // toggling must never trigger that parent navigation.
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-controls={regionId}
          className={
            toggleClassName ??
            "inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
          }
        >
          {expanded
            ? "Show less"
            : moreLabel
              ? moreLabel(hiddenCount)
              : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
