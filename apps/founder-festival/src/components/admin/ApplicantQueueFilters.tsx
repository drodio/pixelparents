"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function ApplicantQueueFilters({ eventId }: { eventId: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const minScore = sp.get("minScore") ?? "";
  const side = sp.get("side") ?? "either";

  function update(k: string, v: string) {
    const next = new URLSearchParams(Array.from(sp.entries()));
    if (v) next.set(k, v); else next.delete(k);
    router.push(`/admin/events/${eventId}?${next.toString()}`);
  }

  const sel = "rounded-md bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-white text-sm";

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <select className={sel} value={side} onChange={(e) => update("side", e.target.value)}>
        <option value="either">Either side</option>
        <option value="founder">Founder side</option>
        <option value="investor">Investor side</option>
      </select>
      <input
        className={sel + " w-24"}
        type="number"
        placeholder="min score"
        value={minScore}
        onChange={(e) => update("minScore", e.target.value)}
      />
    </div>
  );
}
