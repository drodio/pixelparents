"use client";

import { useEffect, useRef, useState } from "react";
import { searchResourceBoardsAction } from "../actions";
import { IconBook, IconX } from "@/components/icons";

type Board = { id: string; title: string };

// "Link a resource board" affordance for a reply composer.
//
// Parent feedback (Jul 2026): when someone asks a question that an existing
// resource board already answers, whoever replies had no way to point at that
// board without leaving the page to go copy its URL. Replies already linkify bare
// http(s) URLs (lib/linkify.tsx), so the missing piece was purely FINDING the
// board — not a new message kind, not new storage.
//
// On pick we append "<title> — <origin>/resources/<id>" to the reply body. The
// origin comes from window.location so the inserted URL is absolute, which is what
// Linkify requires (it deliberately ignores relative paths).
export function BoardLinkPicker({
  onInsert,
  disabled = false,
}: {
  // Receives the text to append to the composer body. The parent owns the body
  // state, so this component never touches the textarea directly.
  onInsert: (snippet: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Debounced search. An empty query is valid and lists the most recent boards,
  // so someone who doesn't know what they're looking for still sees options.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // setLoading lives INSIDE the timeout, not in the effect body — calling
    // setState synchronously during an effect trips react-hooks/set-state-in-effect
    // and causes an extra render pass before the debounce has even started.
    const t = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const r = await searchResourceBoardsAction({ query });
        if (cancelled) return;
        if (r.ok) {
          setResults(r.results);
          setError(null);
        } else {
          setResults([]);
          setError(r.error);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setError("Couldn't search resource boards.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  // Close on outside click and on Escape, so the panel behaves like the other
  // dismissible surfaces in the app.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(board: Board) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    onInsert(`${board.title} — ${origin}/resources/${board.id}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/65 transition hover:bg-white/10 disabled:opacity-40"
      >
        <IconBook className="h-3.5 w-3.5" /> Link a resource board
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-white/15 bg-zinc-950 p-2 shadow-2xl">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards…"
              className="w-full rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber-400/50"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          <ul role="listbox" className="mt-2 max-h-56 overflow-y-auto">
            {loading && <li className="px-2 py-2 text-xs text-white/45">Searching…</li>}
            {!loading && error && <li className="px-2 py-2 text-xs text-red-300">{error}</li>}
            {!loading && !error && results.length === 0 && (
              <li className="px-2 py-2 text-xs text-white/45">No boards found.</li>
            )}
            {!loading &&
              !error &&
              results.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pick(b)}
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-white/85 transition hover:bg-white/10"
                  >
                    {b.title}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
