"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ThreadMessage = { id: string; authorType: string; body: string; createdAt: string };

// Shared support-ticket conversation view. Used on /docs/support/[id] (actor =
// "user") and /admin/support/[id] (actor = "admin"). Renders the message list,
// a reply box (when open), and — for admins — Close/Reopen controls.
export function SupportThread({
  ticketId,
  subject,
  status,
  messages,
  actor,
}: {
  ticketId: string;
  subject: string;
  status: string;
  messages: ThreadMessage[];
  actor: "user" | "admin";
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = status === "open";
  const adminReplied = messages.some((m) => m.authorType === "admin");

  // Admins see the raw lifecycle (Open/Closed). The filer sees clearer wording:
  // Pending (waiting on us) → Responded (we replied) → Closed.
  const statusLabel =
    actor === "admin"
      ? open
        ? "Open"
        : "Closed"
      : !open
        ? "Closed"
        : adminReplied
          ? "Responded"
          : "Pending";
  // Badge tone: amber = waiting on us, emerald = answered/active, zinc = closed.
  const badgeClass = !open
    ? "border-zinc-700 bg-zinc-800 text-zinc-400"
    : actor === "user" && !adminReplied
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";

  async function send() {
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${ticketId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(actor === "admin" ? { "x-support-actor": "admin" } : {}),
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`);
        return;
      }
      setReply("");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${ticketId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: open ? "closed" : "open" }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  // The filer reopens a closed ticket they don't feel was fully resolved.
  async function reopenAsUser() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${ticketId}/reopen`, { method: "POST" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-white">{subject}</h1>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${badgeClass}`}>
          {statusLabel}
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {messages.map((m) => {
          const mine = m.authorType === actor;
          return (
            <li
              key={m.id}
              className={`max-w-[85%] rounded-lg border px-4 py-3 text-sm ${
                m.authorType === "admin"
                  ? "self-start border-[#dfa43a]/30 bg-[#dfa43a]/10 text-amber-100"
                  : "self-end border-zinc-700 bg-zinc-900/60 text-zinc-200"
              } ${mine ? "" : ""}`}
            >
              <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
                {m.authorType === "admin" ? "Founder Festival" : "You"}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          );
        })}
      </ul>

      {open ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            className="min-h-28 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={busy || !reply.trim()}
              className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black hover:bg-[#c98e2a] disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send reply"}
            </button>
            {actor === "admin" && (
              <button
                type="button"
                onClick={toggleStatus}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
              >
                Close ticket
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {actor === "user" && (
            <p className="text-sm text-zinc-500">
              This ticket is closed. If it wasn&apos;t fully resolved, reopen it and we&apos;ll
              pick it back up.
            </p>
          )}
          <button
            type="button"
            onClick={actor === "admin" ? toggleStatus : reopenAsUser}
            disabled={busy}
            className="self-start rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
          >
            {busy ? "Reopening…" : "Reopen ticket"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
