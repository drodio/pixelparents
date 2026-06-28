"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BulkAllToolbar({ eventId, applicantIds }: { eventId: string; applicantIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function bulk(status: "approved" | "denied" | "pending" | "waitlist") {
    if (applicantIds.length === 0) return;
    if (!confirm(`${status} ${applicantIds.length} visible applicant(s)?`)) return;
    setBusy(true);
    await fetch(`/api/admin/events/${eventId}/applicants/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicantIds, status }),
    });
    setBusy(false);
    router.refresh();
  }

  if (applicantIds.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-sm flex-wrap">
      <span className="text-zinc-400">Bulk action on {applicantIds.length} visible:</span>
      <button disabled={busy} onClick={() => bulk("approved")} className="px-3 py-1 rounded bg-emerald-700 text-white disabled:opacity-40">Approve all</button>
      <button disabled={busy} onClick={() => bulk("waitlist")} className="px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-40">Waitlist all</button>
      <button disabled={busy} onClick={() => bulk("denied")} className="px-3 py-1 rounded bg-red-800 text-white disabled:opacity-40">Deny all</button>
      <button disabled={busy} onClick={() => bulk("pending")} className="px-3 py-1 rounded bg-zinc-700 text-white disabled:opacity-40">Move to pending</button>
    </div>
  );
}
