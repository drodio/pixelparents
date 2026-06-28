"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { Avatar } from "@/components/Avatar";
import { displayName } from "@/components/LeaderboardTable";
import { ScoreThemPrompt } from "@/components/ScoreThemPrompt";

// Global "Search Founders & Investors" box rendered in the site header, just to
// the right of the Events nav item. Typing runs a debounced name/company search
// against the same backend the leaderboard uses (/api/leaderboard/search with
// no filters → role=both, combined-score order) and shows matching profiles in
// a dropdown. When nothing matches, it offers to score that person via the
// shared ScoreThemPrompt (→ /?name=…).
//
// Layout: a full input on desktop (sm+); on mobile a search icon that expands
// into a full-width overlay so the cramped phone header keeps its nav links.

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

export function HeaderSearch() {
  const [query, setQuery] = useState("");
  // null = no search has settled yet (initial / in-flight); array = settled.
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Desktop: dropdown opens when the input is focused and has a query.
  const [focused, setFocused] = useState(false);
  // Mobile: the icon toggles a full-width overlay.
  const [mobileOpen, setMobileOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_CHARS;

  // Debounced search. A generation token discards out-of-order responses, the
  // same pattern the leaderboard's own search box uses.
  // Inactive (query too short) just invalidates any in-flight fetch; stale
  // `results`/`loading` are left alone because the dropdown body gates on
  // `active` and won't render them. setLoading lives inside the timer callback
  // (not the effect body) so we don't trigger a synchronous cascading render —
  // mirrors the leaderboard's own search box.
  const genRef = useRef(0);
  useEffect(() => {
    if (!active) {
      genRef.current++;
      return;
    }
    const myGen = ++genRef.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/leaderboard/search?q=${encodeURIComponent(trimmed)}`,
          );
          if (!res.ok) throw new Error(`search failed: ${res.status}`);
          const data: { rows: LeaderboardRow[] } = await res.json();
          if (!cancelled && genRef.current === myGen) {
            setResults(data.rows);
            setLoading(false);
          }
        } catch {
          if (!cancelled && genRef.current === myGen) {
            setResults([]);
            setLoading(false);
          }
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, active]);

  // Close on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setFocused(false);
        setMobileOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFocused(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Focus the mobile input when the overlay opens.
  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus();
  }, [mobileOpen]);

  const reset = useCallback(() => {
    setQuery("");
    setResults(null);
    setFocused(false);
    setMobileOpen(false);
  }, []);

  const visible = results ? results.slice(0, MAX_RESULTS) : [];
  const settledEmpty = active && !loading && results !== null && results.length === 0;

  // Shared dropdown body for both the desktop and mobile renderings, computed
  // once per render (not a nested component — that would remount on every keystroke).
  let resultsBody: ReactNode = null;
  if (active) {
    if (loading && (results === null || results.length === 0)) {
      resultsBody = <div className="px-3 py-3 text-sm text-zinc-500">Searching…</div>;
    } else if (settledEmpty) {
      resultsBody = <ScoreThemPrompt name={trimmed} />;
    } else if (visible.length > 0) {
      resultsBody = (
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {visible.map((row) => (
            <li key={row.id}>
              <Link
                href={row.profileHref}
                onClick={reset}
                className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/60 transition-colors"
              >
                <Avatar imageUrl={row.claimedImageUrl} name={displayName(row)} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{displayName(row)}</div>
                  {row.companyName && (
                    <div className="truncate text-xs text-zinc-500">{row.companyName}</div>
                  )}
                </div>
                <div className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                  {row.combinedScore.toLocaleString("en-US")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      );
    }
  }

  const desktopDropdownOpen = focused && active;

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Desktop: inline input + absolutely-positioned dropdown. */}
      <div className="hidden sm:block relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search..."
          aria-label="Search Founders & Investors"
          className="w-36 lg:w-44 rounded-md border border-zinc-800 bg-zinc-900/60 pl-8 pr-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
        />
        {desktopDropdownOpen && (
          <div className="absolute left-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-zinc-800 bg-[#151515] shadow-xl shadow-black/40">
            {resultsBody}
          </div>
        )}
      </div>

      {/* Mobile: a search icon that expands to a full-width overlay. */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Search Founders & Investors"
        aria-expanded={mobileOpen}
        className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-[#dfa43a] hover:text-amber-200 transition-colors"
      >
        <SearchIcon />
      </button>
      {mobileOpen && (
        <div className="sm:hidden fixed inset-x-0 top-0 z-50 border-b border-zinc-800 bg-[#151515] p-3 shadow-xl shadow-black/40">
          <div className="flex items-center gap-2">
            <input
              ref={mobileInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              aria-label="Search Founders & Investors"
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="shrink-0 px-2 py-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              Cancel
            </button>
          </div>
          {active && (
            <div className="mt-2 overflow-hidden rounded-md border border-zinc-800 bg-black">
              {resultsBody}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="18"
      height="18"
      aria-hidden
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l3.5 3.5" />
    </svg>
  );
}
