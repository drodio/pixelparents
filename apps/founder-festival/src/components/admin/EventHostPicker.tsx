"use client";

import { useState } from "react";
import { useAutosave, AutosaveStatus } from "@/components/admin/useAutosave";

export function EventHostPicker({
  eventId,
  allHosts,
  initialSelectedIds,
}: {
  eventId: string;
  allHosts: { id: string; name: string }[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const { status, saveNow } = useAutosave();

  // Toggling a host saves immediately (no Save button).
  function toggle(id: string) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
    saveNow(async () => {
      const res = await fetch(`/api/admin/events/${eventId}/hosts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostIds: [...n] }),
      });
      return res.ok;
    });
  }

  if (allHosts.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No hosts defined yet. Create them under{" "}
        <a href="/admin/hosts" className="text-[#dfa43a] hover:underline">
          Admin → Hosts
        </a>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {allHosts.map((h) => (
          <label
            key={h.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              selected.has(h.id) ? "border-[#dfa43a] text-white" : "border-zinc-700 text-zinc-400"
            }`}
          >
            <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} className="accent-[#dfa43a]" />
            {h.name}
          </label>
        ))}
      </div>
      <AutosaveStatus status={status} />
    </div>
  );
}
