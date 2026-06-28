"use client";

import { useState } from "react";
import Link from "next/link";

export type HostRow = { id: string; name: string; blurb: string | null; iconUrl: string | null; url: string | null };

export function HostsManager({ initialHosts }: { initialHosts: HostRow[] }) {
  const [hosts, setHosts] = useState<HostRow[]>(initialHosts);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hosts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { host } = await res.json();
        setHosts((h) => [...h, host].sort((a, b) => a.name.localeCompare(b.name)));
        setName("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this host? It will be removed from all events.")) return;
    const res = await fetch(`/api/admin/hosts/${id}`, { method: "DELETE" });
    if (res.ok) setHosts((h) => h.filter((x) => x.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New host name (e.g. District)"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-50"
        >
          + Add host
        </button>
      </div>

      {hosts.length === 0 ? (
        <p className="text-sm text-zinc-500">No hosts yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hosts.map((h) => (
            <div key={h.id} className="flex items-center gap-3 rounded-md border border-zinc-800 p-3">
              {h.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.iconUrl} alt="" className="h-10 w-32 rounded object-contain" />
              ) : (
                <div className="h-10 w-32 rounded bg-zinc-800" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/admin/hosts/${h.id}`} className="text-white hover:underline">
                  {h.name}
                </Link>
                {h.blurb && <div className="truncate text-xs text-zinc-500">{h.blurb}</div>}
              </div>
              <button type="button" onClick={() => remove(h.id)} className="text-xs text-red-400 hover:text-red-300">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
