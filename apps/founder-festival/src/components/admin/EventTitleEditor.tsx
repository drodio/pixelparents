"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";

// The admin event-page <h1>, with a pencil that appears on hover. Click it to
// edit the title inline (Enter saves, Esc cancels); saves via the title route
// and refreshes so the rest of the page picks up the new name.
export function EventTitleEditor({ eventId, initialTitle }: { eventId: string; initialTitle: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState(initialTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim();
    if (!next) {
      setError("Title can’t be empty");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/title`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { title?: string; error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      setTitle(data.title ?? next);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(title);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            aria-label="Event title"
            className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-display text-2xl font-bold text-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-md bg-[#dfa43a] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#e8b452] disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={cancel} className="text-sm text-zinc-400 hover:text-white">
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        aria-label="Edit title"
        title="Edit title"
        className="text-zinc-500 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
      >
        <FiEdit2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
