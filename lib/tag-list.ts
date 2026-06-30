// Pure collapse math for the <TagList> component (components/tag-list.tsx).
// Extracted so the "show a few + (+N more)" logic is unit-testable without a DOM
// renderer (the test suite is node-only — see vitest.config.ts).

export const DEFAULT_TAG_MAX = 6;

export type TagListView<T> = {
  /** The tags to actually render right now (all when expanded, first `max` when collapsed). */
  shown: T[];
  /** How many tags are hidden behind the "+N more" button (0 when expanded or nothing overflows). */
  hiddenCount: number;
  /** Whether the toggle button should render at all (only when something overflows). */
  hasOverflow: boolean;
};

// Given the full tag list, a collapse threshold, and whether the caller is
// currently expanded, decide what to show. `max` is clamped to >= 0; a non-finite
// or negative value falls back to the default so a caller can't render a broken
// view. When expanded (or nothing overflows) every tag is shown.
export function tagListView<T>(
  tags: readonly T[],
  max: number = DEFAULT_TAG_MAX,
  expanded = false,
): TagListView<T> {
  // `Infinity` means "no limit — show everything". A NaN or negative value is
  // nonsense, so fall back to the default rather than render a broken view.
  const limit =
    max === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(max) && max >= 0
        ? Math.floor(max)
        : DEFAULT_TAG_MAX;
  const hasOverflow = tags.length > limit;
  if (expanded || !hasOverflow) {
    return { shown: [...tags], hiddenCount: 0, hasOverflow };
  }
  return {
    shown: tags.slice(0, limit),
    hiddenCount: tags.length - limit,
    hasOverflow: true,
  };
}
