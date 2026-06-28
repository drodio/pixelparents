"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";

// "Re-Import from Luma" — refetches this event's title, description, cover, date,
// and venue from Luma and overwrites those fields. Full reload after so the
// title/description editors pick up the new values. Hidden for non-Luma events.
export function ReimportLumaButton({ eventId, lumaUrl }: { eventId: string; lumaUrl: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (
      !window.confirm(
        "Re-import this event's title, description, cover image, date & venue from Luma? This overwrites those fields with the current Luma values.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reimport-luma`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? `failed (${res.status})`);
      setMsg("Re-imported — reloading…");
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Re-import failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded-md border border-[#dfa43a]/60 px-3 py-1.5 text-sm text-[#dfa43a] hover:bg-[#dfa43a]/10 disabled:opacity-50"
      >
        {busy ? "Re-importing…" : "Re-Import from Luma"}
      </button>
      {lumaUrl && (
        <a
          href={lumaUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View on Luma"
          title="View on Luma"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <ExternalLinkIcon size={16} />
        </a>
      )}
      {msg && <span className="text-sm text-zinc-400">{msg}</span>}
    </div>
  );
}
