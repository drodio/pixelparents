"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Badge = { id: string; name: string; slug: string };

// Inline event-badge picker (auto-saves, no Save button). Type to filter the
// existing vocabulary or create a new badge on Enter; click a pill's × to remove.
// Badges are deduped server-side by slug, so "Mixer" and "mixer" collapse.
export function EventBadgePicker({
  eventId,
  initialBadges,
}: {
  eventId: string;
  initialBadges: Badge[];
}) {
  const [names, setNames] = useState<string[]>(initialBadges.map((b) => b.name));
  const [all, setAll] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the whole vocabulary for autocomplete.
  useEffect(() => {
    void fetch("/api/admin/event-badges")
      .then((r) => r.json())
      .then((d: { badges?: Badge[] }) => setAll((d.badges ?? []).map((b) => b.name)))
      .catch(() => {});
  }, []);

  function persist(next: string[]) {
    setNames(next);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await fetch(`/api/admin/events/${eventId}/badges-tax`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ names: next }),
        });
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, 400);
  }

  function add(name: string) {
    const t = name.trim();
    if (!t) return;
    if (names.some((n) => n.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    persist([...names, t]);
    setDraft("");
    // Optimistically add to the vocabulary so it appears in suggestions.
    setAll((a) => (a.some((n) => n.toLowerCase() === t.toLowerCase()) ? a : [...a, t]));
  }

  function remove(name: string) {
    persist(names.filter((n) => n !== name));
  }

  const suggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return all
      .filter((n) => !names.some((x) => x.toLowerCase() === n.toLowerCase()))
      .filter((n) => (q ? n.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [all, names, draft]);

  return (
    <div className="flex flex-col gap-2">
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 rounded-md border border-[#dfa43a]/60 bg-[#dfa43a]/10 px-2.5 py-0.5 text-xs text-[#dfa43a]"
            >
              {n}
              <button
                type="button"
                aria-label={`Remove ${n}`}
                onClick={() => remove(n)}
                className="text-[#dfa43a]/70 hover:text-[#dfa43a]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          }
        }}
        placeholder="Add a badge (e.g. Intimate dinner) — Enter to add"
        className="max-w-md rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-md border border-zinc-700 px-2.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      {status !== "idle" && (
        <span className="text-[10px] text-zinc-500">{status === "saving" ? "Saving…" : "Saved"}</span>
      )}
    </div>
  );
}
