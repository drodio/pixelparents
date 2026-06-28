"use client";

import { useState } from "react";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

export function EventSponsorPicker({
  eventId,
  allSponsors,
  initialSelectedIds,
}: {
  eventId: string;
  allSponsors: { id: string; name: string }[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const { status, saveNow } = useAutosave();

  // Toggling a sponsor saves immediately (no Save button).
  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
    saveNow(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/sponsors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sponsorIds: [...n] }),
      });
      return res.ok;
    });
  }

  if (allSponsors.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No sponsors defined yet. Create them under{" "}
        <a href="/admin/sponsors" className="text-[#dfa43a] hover:underline">
          Admin → Sponsors
        </a>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {allSponsors.map((s) => (
          <label
            key={s.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              selected.has(s.id) ? "border-[#dfa43a] text-white" : "border-zinc-700 text-zinc-400"
            }`}
          >
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="accent-[#dfa43a]" />
            {s.name}
          </label>
        ))}
      </div>
      <AutosaveStatus status={status} />
    </div>
  );
}
