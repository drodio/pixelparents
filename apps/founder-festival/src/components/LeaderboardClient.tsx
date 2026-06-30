"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardRow, LeaderboardFilter } from "@/lib/leaderboard";
import { type LeaderboardTab, FILTERABLE_BADGE_IDS } from "@/lib/leaderboard-constants";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LeaderboardSortControl } from "@/components/LeaderboardSortControl";
import { LeaderboardActiveFilters } from "@/components/LeaderboardActiveFilters";
import { LeaderboardFilters } from "@/components/LeaderboardFilters";

type Props = {
  initialRows: LeaderboardRow[];
  initialNextCursor: string | null;
  filter: LeaderboardFilter;
  badgeCounts?: Record<string, number>;
  industryCounts?: Record<string, number>;
  highlightEvalId: string | null;
  youEvalId: string | null;
  // CONNECT MODE: render a score-free Directory — no rank numbers, no score
  // columns, no score-based sort control, no infinite-scroll pagination (the
  // page SSRs the full alphabetical list). Defaults false (leaderboard).
  connectMode?: boolean;
};

function activeFacetCount(filter: LeaderboardFilter): number {
  return (
    filter.stages.length + filter.outcomes.length + filter.badges.length +
    filter.industries.length +
    (filter.role !== "both" ? 1 : 0) +
    (filter.raisedMin != null ? 1 : 0) + (filter.teamMin != null ? 1 : 0)
  );
}

// Strip the cursor/limit query params from the URL and substitute the cursor
// the client wants for the next page request. Everything else (role, sort,
// stage, outcome, badge, raised_min, raised_max, team_min) is preserved
// verbatim so the next page matches the SSR filter exactly.
function buildPageUrl(cursor: string): string {
  const sp = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  sp.set("cursor", cursor);
  sp.delete("limit");
  return `/api/leaderboard/page?${sp.toString()}`;
}

function buildSearchUrl(q: string): string {
  const sp = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  sp.set("q", q);
  sp.delete("cursor");
  sp.delete("limit");
  return `/api/leaderboard/search?${sp.toString()}`;
}

export function LeaderboardClient({
  initialRows,
  initialNextCursor,
  filter,
  badgeCounts,
  industryCounts,
  highlightEvalId,
  youEvalId,
  connectMode = false,
}: Props) {
  const router = useRouter();

  // Single navigation primitive for every filter/sort change: clone the current
  // query, let the caller mutate it, drop the row-highlight + pagination params,
  // and push. The SSR re-render then resets the list (the page keys
  // LeaderboardClient on the filter, so a new filter remounts it).
  const navigate = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      mutate(sp);
      sp.delete("e");
      sp.delete("cursor");
      sp.delete("limit");
      const qs = sp.toString();
      router.push(qs ? `/leaderboard?${qs}` : "/leaderboard", { scroll: false });
    },
    [router],
  );

  // Click a score column to sort by it. Mirrors the admin tables: clicking a
  // new column selects it descending ("highest"); clicking the active column
  // toggles direction. Written to the URL (?sort=…&top=…) so it's shareable.
  const onSort = useCallback(
    (column: LeaderboardTab) => {
      const nextDir =
        column === filter.sort && filter.direction === "highest" ? "lowest" : "highest";
      navigate((sp) => {
        sp.set("sort", column);
        if (nextDir === "lowest") sp.set("top", "lowest");
        else sp.delete("top"); // "highest" is the default — keep the URL clean
      });
    },
    [navigate, filter.sort, filter.direction],
  );

  // Click a badge on a row to toggle it as a filter. Industry badges
  // ("industry:<slug>") toggle the `industry` CSV facet; the fixed-taxonomy
  // badges toggle the `badge` facet.
  const onBadgeFilter = useCallback(
    (id: string) => {
      const isIndustry = id.startsWith("industry:");
      const param = isIndustry ? "industry" : "badge";
      const value = isIndustry ? id.slice("industry:".length) : id;
      navigate((sp) => {
        const cur = (sp.get(param) ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
        if (next.length) sp.set(param, next.join(","));
        else sp.delete(param);
      });
    },
    [navigate],
  );

  // Cumulative paginated list. Starts with the SSR'd first page; each
  // intersection-triggered fetch appends to this. Cleared/reset only when
  // the user changes filters (which causes a full SSR navigation).
  const [pagedRows, setPagedRows] = useState<LeaderboardRow[]>(initialRows);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Search state. `searchRows === null` means "not in search mode" (show
  // `pagedRows`); an empty array means "in search mode, zero results".
  const [query, setQuery] = useState("");
  const [searchRows, setSearchRows] = useState<LeaderboardRow[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const facetCount = activeFacetCount(filter);

  // Debounced server search. Each newer keystroke supersedes pending fetches
  // via a generation token, so out-of-order responses don't clobber state.
  // When the query is empty, the cleanup from the previous run clears the
  // pending timer and we leave `searchRows` alone — visibleRows derives from
  // `inSearch` anyway, so stale values aren't rendered.
  const searchGenRef = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // Invalidate any in-flight fetch so its setSearchRows is a no-op when
      // the user later starts a new search.
      searchGenRef.current++;
      return;
    }
    const myGen = ++searchGenRef.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      setSearchLoading(true);
      void (async () => {
        try {
          const res = await fetch(buildSearchUrl(trimmed));
          if (!res.ok) throw new Error(`search failed: ${res.status}`);
          const data: { rows: LeaderboardRow[] } = await res.json();
          if (!cancelled && searchGenRef.current === myGen) {
            setSearchRows(data.rows);
            setSearchLoading(false);
          }
        } catch {
          if (!cancelled && searchGenRef.current === myGen) {
            setSearchRows([]);
            setSearchLoading(false);
          }
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  // Append the next page when the sentinel becomes visible. Each scroll
  // landing fires once; while a fetch is in flight, observer-fires are
  // ignored. When `nextCursor` is null we've reached the tail.
  const loadNextPage = useCallback(async () => {
    if (pageLoading || !nextCursor) return;
    setPageLoading(true);
    setPageError(null);
    try {
      const res = await fetch(buildPageUrl(nextCursor));
      if (!res.ok) throw new Error(`page fetch failed: ${res.status}`);
      const data: { rows: LeaderboardRow[]; nextCursor: string | null } = await res.json();
      setPagedRows((prev) => [...prev, ...data.rows]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setPageLoading(false);
    }
  }, [nextCursor, pageLoading]);

  // IntersectionObserver: when the sentinel enters the viewport (with a
  // 400px rootMargin so we prefetch before the user hits the bottom),
  // load the next page. Skip while in search mode (the sentinel is hidden
  // and pagination is paused for clarity).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (query.trim().length > 0) return;
    if (!nextCursor) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadNextPage();
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadNextPage, nextCursor, query]);

  const inSearch = query.trim().length > 0;
  const visibleRows: LeaderboardRow[] = useMemo(() => {
    if (!inSearch) return pagedRows;
    return searchRows ?? [];
  }, [inSearch, pagedRows, searchRows]);

  // Deep-link scroll-to (?e=<id>): a highlighted row far down the list (e.g.
  // #332) isn't in the first page, so the table can't scroll to it. Keep pulling
  // pages until the row is loaded (or we reach the tail). Once present, the table
  // scrolls to it. Paused in search mode.
  const highlightLoaded = !highlightEvalId || pagedRows.some((r) => r.id === highlightEvalId);
  useEffect(() => {
    if (!highlightEvalId || highlightLoaded || inSearch || !nextCursor || pageLoading) return;
    loadNextPage();
  }, [highlightEvalId, highlightLoaded, inSearch, nextCursor, pageLoading, loadNextPage]);

  return (
    <div className="max-w-6xl mx-auto w-full flex flex-col md:flex-row gap-6 md:gap-8">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0">
        <LeaderboardFilters filter={filter} badgeCounts={badgeCounts} industryCounts={industryCounts} />
      </aside>

      {/* Results column */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-3">
          {/* Mobile filter trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
          >
            Filters
            {facetCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-md bg-zinc-100 text-zinc-900 text-xs font-semibold h-5 min-w-5 px-1">
                {facetCount}
              </span>
            )}
          </button>

          <label className="block flex-1 min-w-0">
            <span className="sr-only">{connectMode ? "Search the directory" : "Search the leaderboard"}</span>
            <input
              type="search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              // Shorter placeholder fits at 390px next to the mobile Filters
              // pill; the sm: variant restores the full prompt on desktop.
              placeholder="Search name or company"
              aria-label={connectMode ? "Search the directory" : "Search the leaderboard"}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
          </label>
        </div>

        {/* Active-filter pills (white, removable). Hidden when no filters. */}
        <LeaderboardActiveFilters filter={filter} navigate={navigate} />

        {inSearch && (
          <div className="text-xs text-zinc-500" aria-live="polite">
            {searchLoading
              ? "Searching..."
              : `${visibleRows.length} match${visibleRows.length === 1 ? "" : "es"}`}
          </div>
        )}

        {/* Mobile-only sort control. The card layout has no column headers, so
            this segmented row drives the same onSort the desktop headers use.
            Hidden in connect mode — the Directory has no score sort. */}
        {!connectMode && (
          <LeaderboardSortControl
            sort={filter.sort}
            direction={filter.direction}
            onSort={onSort}
            className="sm:hidden"
          />
        )}

        <LeaderboardTable
          rows={visibleRows}
          tab={filter.sort}
          direction={filter.direction}
          onSort={onSort}
          onBadgeFilter={onBadgeFilter}
          filterableBadgeIds={FILTERABLE_BADGE_IDS}
          highlightEvalId={highlightEvalId}
          youEvalId={youEvalId}
          searchQuery={inSearch ? query : ""}
          // Treat the pre-debounce/in-flight window as loading so the empty
          // state doesn't flash before the first results settle.
          searchLoading={searchLoading || (inSearch && searchRows === null)}
          // Connect mode: drop rank numbers + score columns + sortable headers.
          connectMode={connectMode}
        />

        {!inSearch && (
          <>
            {/* Sentinel for IntersectionObserver. Sized so it's a real target
                but invisible. Only present while there are more pages. */}
            {nextCursor && (
              <div ref={sentinelRef} aria-hidden="true" className="h-8 w-full" />
            )}
            {pageLoading && (
              <div className="text-center text-xs text-zinc-500 py-2">
                Loading more...
              </div>
            )}
            {pageError && (
              <div className="text-center text-xs text-red-400 py-2">
                {pageError}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setPageError(null);
                    void loadNextPage();
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!nextCursor && pagedRows.length > 0 && (
              <div className="text-center text-xs text-zinc-600 py-4">
                {connectMode ? "End of directory" : "End of leaderboard"}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto h-full w-72 max-w-[85%] bg-[#151515] border-l border-zinc-800 p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display text-base font-semibold text-zinc-100">Filters</span>
              {/* 40×40 hit area + visually-centered glyph. The drawer used to
                  ship a 43×16 close target — way under iOS HIG. */}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="-mr-2 inline-flex items-center justify-center w-10 h-10 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <LeaderboardFilters filter={filter} badgeCounts={badgeCounts} industryCounts={industryCounts} />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-6 w-full rounded-md bg-zinc-100 text-zinc-900 px-3 py-2 text-sm font-medium"
            >
              Show results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
