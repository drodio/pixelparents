"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Org = { id: string; name: string };
type Assignment = { ownerType: "host" | "sponsor"; ownerId: string };

// Edit one admin: their display name + which hosts/sponsors they're associated
// with. Those associations authorize which org badges they may bulk-apply on the
// scored-profiles page. Super-admins can apply every org badge regardless.
export function AdminDetailEditor({
  accessId,
  initialName,
  hosts,
  sponsors,
  initialAssignments,
}: {
  accessId: string;
  initialName: string;
  hosts: Org[];
  sponsors: Org[];
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [hostIds, setHostIds] = useState<Set<string>>(
    new Set(initialAssignments.filter((a) => a.ownerType === "host").map((a) => a.ownerId)),
  );
  const [sponsorIds, setSponsorIds] = useState<Set<string>>(
    new Set(initialAssignments.filter((a) => a.ownerType === "sponsor").map((a) => a.ownerId)),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const assignments: Assignment[] = [
      ...[...hostIds].map((ownerId) => ({ ownerType: "host" as const, ownerId })),
      ...[...sponsorIds].map((ownerId) => ({ ownerType: "sponsor" as const, ownerId })),
    ];
    try {
      const res = await fetch(`/api/admin/access/${accessId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, assignments }),
      });
      if (res.ok) {
        setMsg("Saved.");
        router.refresh();
      } else {
        setMsg(`Error: ${(await res.json().catch(() => ({}))).error ?? res.status}`);
      }
    } catch {
      setMsg("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-300" htmlFor="admin-name">
          Name
        </label>
        <input
          id="admin-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Admin name"
          className="max-w-sm rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </section>

      <OrgChecklist
        title="Hosts"
        empty="No hosts yet."
        orgs={hosts}
        selected={hostIds}
        onToggle={(id) => toggle(hostIds, setHostIds, id)}
      />

      <OrgChecklist
        title="Sponsors"
        empty="No sponsors yet."
        orgs={sponsors}
        selected={sponsorIds}
        onToggle={(id) => toggle(sponsorIds, setSponsorIds, id)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#c98e2a] disabled:opacity-40"
        >
          Save changes
        </button>
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}

function OrgChecklist({
  title,
  empty,
  orgs,
  selected,
  onToggle,
}: {
  title: string;
  empty: string;
  orgs: Org[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="-mt-1 text-sm text-zinc-500">
        Associating {title.toLowerCase()} lets this admin apply their custom badges to scored profiles.
      </p>
      {orgs.length === 0 ? (
        <p className="text-sm text-zinc-600">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {orgs.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-700"
            >
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => onToggle(o.id)}
                className="h-4 w-4 accent-[#dfa43a]"
              />
              <span>{o.name}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
