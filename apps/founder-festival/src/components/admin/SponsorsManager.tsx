"use client";

import { useState } from "react";
import Link from "next/link";

export type SponsorRow = {
  id: string;
  name: string;
  blurb: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  people: { evaluationId: string; fullName: string | null }[];
};

export function SponsorsManager({ initialSponsors }: { initialSponsors: SponsorRow[] }) {
  const [sponsors, setSponsors] = useState<SponsorRow[]>(initialSponsors);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const { sponsor } = await res.json();
        setSponsors((s) => [...s, { ...sponsor, people: [] }].sort((a, b) => a.name.localeCompare(b.name)));
        setName("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this sponsor? It will be removed from all events.")) return;
    const res = await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) setSponsors((s) => s.filter((x) => x.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New sponsor name"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <button type="button" onClick={create} disabled={busy} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-50">
          + Add sponsor
        </button>
      </div>

      {sponsors.length === 0 ? (
        <p className="text-sm text-zinc-500">No sponsors yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sponsors.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-md border border-zinc-800 p-3">
              {s.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logoUrl} alt="" className="h-10 w-32 rounded object-contain bg-white/5" />
              ) : (
                <div className="h-10 w-32 rounded bg-zinc-800" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/admin/sponsors/${s.id}`} className="text-white hover:underline">
                  {s.name}
                </Link>
                {s.blurb && <div className="truncate text-xs text-zinc-500">{s.blurb}</div>}
                {s.people.length > 0 ? (
                  <div className="mt-0.5 truncate text-xs text-zinc-400">
                    {s.people.map((p) => p.fullName ?? "Unnamed").join(", ")}
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-zinc-600">No people attached</div>
                )}
              </div>
              <button type="button" onClick={() => remove(s.id)} className="text-xs text-red-400 hover:text-red-300">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
