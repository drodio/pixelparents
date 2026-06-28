"use client";

import { useEffect, useRef, useState } from "react";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { Avatar } from "@/components/Avatar";
import { displayName } from "@/components/LeaderboardTable";
import { scoreThemHref } from "@/lib/score-them";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";

// Admin profile attach control. Reuses the SAME backend the header + leaderboard
// search use (/api/leaderboard/search), shows matching profiles, and on click
// fires onAttach with the selected profile. When nothing matches, it offers to
// score a new person — the same affordance as the public search, but opened in a
// NEW TAB so the admin doesn't lose the sponsor/host they're editing.

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

export type PickerResult = {
  id: string;
  fullName: string | null;
  companyName: string | null;
  combinedScore: number;
  claimedImageUrl: string | null;
  linkedinUrl: string;
};

export function AdminProfilePicker({
  onAttach,
  excludeIds,
  placeholder = "Search people by name or company…",
}: {
  onAttach: (r: PickerResult) => void | Promise<void>;
  excludeIds?: Set<string>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_CHARS;

  // Debounced search with a generation token (same pattern as HeaderSearch).
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
          const res = await fetch(`/api/leaderboard/search?q=${encodeURIComponent(trimmed)}`);
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

  // Close dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function pick(row: LeaderboardRow) {
    await onAttach({
      id: row.id,
      fullName: row.fullName,
      companyName: row.companyName,
      combinedScore: row.combinedScore,
      claimedImageUrl: row.claimedImageUrl,
      linkedinUrl: row.linkedinUrl,
    });
    setQuery("");
    setResults(null);
    setOpen(false);
  }

  const visible = (results ?? []).slice(0, MAX_RESULTS);
  const settledEmpty = active && !loading && results !== null && results.length === 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
      />
      {open && active && (
        <div className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-800 bg-[#151515] shadow-xl shadow-black/40">
          {loading && (results === null || results.length === 0) ? (
            <div className="px-3 py-3 text-sm text-zinc-500">Searching…</div>
          ) : settledEmpty ? (
            <div className="px-3 py-3 text-sm text-zinc-400 leading-relaxed">
              <span className="text-zinc-300">{trimmed}</span> isn&apos;t on the leaderboard yet.{" "}
              <a href={scoreThemHref(trimmed)} target="_blank" rel="noopener noreferrer" className="text-[#dfa43a] hover:underline whitespace-nowrap">
                Score them now <ExternalLinkIcon className="ml-0.5" />
              </a>
              <div className="mt-1 text-xs text-zinc-600">Opens in a new tab. Score them, then search here again to attach.</div>
            </div>
          ) : visible.length > 0 ? (
            <ul className="max-h-[50vh] overflow-y-auto py-1">
              {visible.map((row) => {
                const added = excludeIds?.has(row.id);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => pick(row)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Avatar imageUrl={row.claimedImageUrl} name={displayName(row)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-100">{displayName(row)}</div>
                        {row.companyName && <div className="truncate text-xs text-zinc-500">{row.companyName}</div>}
                      </div>
                      {added ? (
                        <span className="shrink-0 text-xs text-zinc-500">Added</span>
                      ) : (
                        <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                          {row.combinedScore.toLocaleString("en-US")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
