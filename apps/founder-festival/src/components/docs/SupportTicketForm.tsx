"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Free-paragraph support ticket form. Rendered only for claimed users (the
// server decides). On submit, POSTs to /api/support and routes to the new ticket.
export function SupportTicketForm() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.push(`/docs/support/${data.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="How can we help? Describe your question or issue in as much detail as you like."
        className="min-h-40 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !body.trim()}
        className="self-start rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#c98e2a] disabled:opacity-40"
      >
        {busy ? "Submitting…" : "Submit ticket"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
