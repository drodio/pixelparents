"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  applicantId: string;
  eventId: string;
  fullName: string | null;
  email: string;
  linkedinUrl: string;
  founderScore: number | null;
  investorScore: number | null;
  companyStage: string | null;
  status: string;
  adminNote: string | null;
};

export function ApplicantRow(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(p.adminNote ?? "");

  async function transition(to: "approved" | "denied" | "pending" | "waitlist") {
    setBusy(true);
    await fetch(`/api/admin/events/${p.eventId}/applicants/${p.applicantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: to }),
    });
    setBusy(false);
    router.refresh();
  }

  async function saveNote() {
    await fetch(`/api/admin/events/${p.eventId}/applicants/${p.applicantId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminNote: note }),
    });
  }

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-900">
      <td className="px-4 py-3">
        {/* min-w-0 lets the name/contact block shrink in a narrow cell; truncate keeps long names/emails from overflowing on mobile */}
        <div className="flex flex-col min-w-0">
          <span className="text-white truncate">{p.fullName ?? <span className="text-zinc-500">(no name)</span>}</span>
          <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs link">LinkedIn</a>
          <span className="text-xs text-zinc-500 truncate">{p.email}</span>
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums">{p.founderScore?.toLocaleString("en-US") ?? "—"} / {p.investorScore?.toLocaleString("en-US") ?? "—"}</td>
      <td className="px-4 py-3">{p.companyStage ?? "—"}</td>
      <td className="px-4 py-3">{p.status}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <button disabled={busy} onClick={() => transition("approved")} className="px-2 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white">Approve</button>
          <button disabled={busy} onClick={() => transition("pending")} className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white">Pending</button>
          <button disabled={busy} onClick={() => transition("waitlist")} className="px-2 py-1 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white">Waitlist</button>
          <button disabled={busy} onClick={() => transition("denied")} className="px-2 py-1 text-xs rounded bg-red-800 hover:bg-red-700 text-white">Deny</button>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Admin-only note…"
          className="mt-2 w-full text-xs bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-300"
          rows={1}
        />
      </td>
    </tr>
  );
}
