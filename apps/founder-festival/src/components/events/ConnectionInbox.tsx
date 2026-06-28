"use client";

import { useState } from "react";

export type IncomingRequest = { id: string; fromName: string | null };

export function ConnectionInbox({ initial }: { initial: IncomingRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "denied") {
    setBusy(id);
    try {
      const res = await fetch("/api/connections/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: id, decision }),
      });
      if (res.ok) setRequests((rs) => rs.filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <h3 className="text-sm font-medium text-amber-300">Connection requests</h3>
      {requests.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-200">{r.fromName ?? "An attendee"} wants to connect</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => decide(r.id, "approved")} disabled={busy === r.id} className="rounded-md bg-[#dfa43a] px-3 py-1 text-xs font-medium text-black hover:opacity-90 disabled:opacity-50">
              Approve
            </button>
            <button type="button" onClick={() => decide(r.id, "denied")} disabled={busy === r.id} className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
