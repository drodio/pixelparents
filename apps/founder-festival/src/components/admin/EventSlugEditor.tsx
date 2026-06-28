"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify, slugifyEvent } from "@/lib/slugify";

// Edits an event's public URL slug (/events/<slug>). Lets the admin type a slug
// or generate one from the event name, checks it server-side (format +
// uniqueness), and refreshes on success so the rest of the page picks up the
// new slug. Changing the slug breaks previously shared links — we say so.
export function EventSlugEditor({
  eventId,
  initialSlug,
  eventTitle,
}: {
  eventId: string;
  initialSlug: string;
  eventTitle: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [saved, setSaved] = useState(initialSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromName = slugify(eventTitle);
  const dirty = slug !== saved;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/slug`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      const next = data.slug ?? slugifyEvent(slug);
      setSlug(next);
      setSaved(next);
      router.refresh(); // header link, preview, recap URL all read event.slug
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white font-mono";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">festival.so/events/</span>
        <input
          className={input}
          value={slug}
          spellCheck={false}
          onChange={(e) => setSlug(slugifyEvent(e.target.value))}
          aria-label="Event slug"
        />
        {fromName && fromName !== slug && (
          <button
            type="button"
            onClick={() => setSlug(fromName)}
            className="text-xs text-[#dfa43a] hover:underline"
          >
            Use event name
          </button>
        )}
        <button
          type="button"
          disabled={busy || !dirty || !slug}
          onClick={save}
          className="rounded-md bg-[#dfa43a] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#e8b452] disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {dirty && !error && (
        <p className="text-xs text-zinc-500">
          Changing the slug breaks any previously shared /events/{saved} link.
        </p>
      )}
    </div>
  );
}
