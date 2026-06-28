"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  rubric: string; // "founder" | "investor"
  reason: string;
  points: number;
  originalReason: string | null;
  originalPoints: number | null;
  confidence: number;
};

// Renders one pending row with the owner-edited text on top, the AI's
// original below (struck through), and admin Confirm / Reject buttons.
// Optimistic UI: row hides itself on a successful action; on failure it
// snaps back so the admin can retry.
type AiCheck = {
  confidence: number;
  verdict: "verified" | "partial" | "unverified" | "contradicted";
  summary: string;
  sources: string[];
};

const VERDICT_STYLE: Record<AiCheck["verdict"], string> = {
  verified: "text-emerald-400",
  partial: "text-amber-400",
  unverified: "text-zinc-400",
  contradicted: "text-red-400",
};

type ThreadMessage = {
  id: string;
  direction: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  createdAt: string;
};
type Thread = {
  suggestedTo: string | null;
  requestNumber: number | null;
  messages: ThreadMessage[];
};

export function PendingItemRow({ item }: { item: Item }) {
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AiCheck | null>(null);
  const router = useRouter();
  // Authoritative current values for THIS row. Seeded from the server prop, then
  // updated from the save RESPONSE so the UI reflects the persisted edit without
  // depending on router.refresh() propagating a fresh prop (which races the write
  // and is unreliable for client components that also pre-fill from the prop).
  const [curReason, setCurReason] = useState(item.reason);
  const [curPoints, setCurPoints] = useState(item.points);
  const [editing, setEditing] = useState(false);
  const [editReason, setEditReason] = useState(item.reason);
  const [editPoints, setEditPoints] = useState(String(item.points));
  const [savingEdit, setSavingEdit] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [thread, setThread] = useState<Thread | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);

  async function toggleEmail() {
    const next = !emailOpen;
    setEmailOpen(next);
    if (next && !thread) {
      try {
        const res = await fetch(`/api/score-items/${item.id}/email`);
        const j = (await res.json()) as Thread;
        setThread(j);
        setEmailTo((t) => t || j.suggestedTo || "");
        setEmailSubject((s) =>
          s ||
          (j.requestNumber
            ? `RE: Your requested profile update (Request #${j.requestNumber})`
            : "Your requested profile update"),
        );
      } catch {
        /* leave the form usable even if the thread fails to load */
      }
    }
  }

  async function sendEmail() {
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/score-items/${item.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: emailTo.trim(), subject: emailSubject.trim(), body: emailBody.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setEmailBody("");
        // refetch the thread so the just-sent message shows
        const t = await fetch(`/api/score-items/${item.id}/email`).then((r) => r.json() as Promise<Thread>);
        setThread(t);
        if (!emailSubject && t.requestNumber) {
          setEmailSubject(`RE: Your requested profile update (Request #${t.requestNumber})`);
        }
      } else {
        setErr(j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "send failed");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit() {
    setSavingEdit(true);
    setErr(null);
    try {
      const res = await fetch(`/api/score-items/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "modify", reason: editReason.trim(), points: Number(editPoints) || 0 }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        // Trust the persisted row from the response — this is what's in the DB.
        const saved = (j as { item?: { reason?: string; points?: number } }).item;
        setCurReason(saved?.reason ?? editReason.trim());
        setCurPoints(saved?.points ?? (Number(editPoints) || 0));
        setEditing(false);
        router.refresh(); // also refresh badges/counts; row no longer depends on it
      } else {
        setErr(j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSavingEdit(false);
    }
  }

  async function runAiCheck() {
    setAiBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/score-items/${item.id}/ai-check`, { method: "POST" });
      const j = await res.json();
      if (res.ok) setAi(j as AiCheck);
      else setErr(j.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI check failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function act(action: "confirm" | "reject") {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/score-items/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setHidden(true);
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(null);
    }
  }

  if (hidden) return null;

  const reasonChanged = item.originalReason && item.originalReason !== curReason;
  const pointsChanged =
    item.originalPoints != null && item.originalPoints !== curPoints;

  return (
    <li className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <span
        title="Pending admin review"
        className="shrink-0 mt-0.5 inline-flex h-7 px-2 items-center justify-center rounded-md bg-[#dfa43a] text-black text-[10px] font-semibold uppercase tracking-wider"
      >
        {item.rubric}
      </span>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                value={editPoints}
                onChange={(e) => setEditPoints(e.target.value)}
                className="w-16 rounded border border-zinc-700 bg-black/60 px-1.5 py-1 text-xs font-mono text-white"
                title="points"
              />
              <span className="text-xs text-zinc-500">pts</span>
            </div>
            <textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-zinc-700 bg-black/60 px-2 py-1 text-sm text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit || !editReason.trim()}
                className="rounded bg-[#D4A24A] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#E0B05A] disabled:opacity-40"
              >
                {savingEdit ? "Saving…" : "Save edit"}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-white/40 hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-zinc-200">
            <span className="font-mono text-xs text-zinc-500 mr-2">
              {curPoints >= 0 ? "+" : ""}
              {curPoints}pts
            </span>
            {curReason}
          </div>
        )}
        {(reasonChanged || pointsChanged) && (
          <div className="text-xs text-zinc-500 line-through">
            <span className="font-mono mr-2">
              {item.originalPoints != null
                ? `${item.originalPoints >= 0 ? "+" : ""}${item.originalPoints}pts`
                : ""}
            </span>
            {item.originalReason ?? ""}
          </div>
        )}
        {err && (
          <p className="text-xs text-red-400">Error: {err}</p>
        )}
        {ai && (
          <div className="mt-1 rounded border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs">
            <span className={`font-semibold uppercase tracking-wide ${VERDICT_STYLE[ai.verdict]}`}>
              {ai.verdict}
            </span>
            <span className="ml-2 font-mono text-zinc-300">{ai.confidence}% confident</span>
            <span className="ml-2 text-zinc-400">— {ai.summary}</span>
            {ai.sources.length > 0 && (
              <span className="ml-2 text-zinc-600">
                (
                {ai.sources.slice(0, 3).map((s, i) => (
                  <a key={s} href={s} target="_blank" rel="noopener noreferrer" className="link">
                    {i > 0 ? ", " : ""}src{i + 1}
                  </a>
                ))}
                )
              </span>
            )}
          </div>
        )}
        {emailOpen && (
          <div className="mt-2 rounded-md border border-indigo-900/60 bg-indigo-950/20 px-2.5 py-2 flex flex-col gap-2">
            {thread && thread.messages.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded border px-2 py-1 text-xs ${
                      m.direction === "outbound"
                        ? "border-zinc-800 bg-zinc-900/50"
                        : "border-emerald-900/60 bg-emerald-950/20"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {m.direction === "outbound" ? "→ sent" : "← reply"} · {m.subject}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap text-zinc-300">{m.body}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 w-12">To</label>
              <input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="user@email.com"
                className="flex-1 rounded border border-zinc-700 bg-black/60 px-2 py-1 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 w-12">Subject</label>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="flex-1 rounded border border-zinc-700 bg-black/60 px-2 py-1 text-xs text-white"
              />
            </div>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={3}
              placeholder="Write your message…"
              className="w-full rounded border border-zinc-700 bg-black/60 px-2 py-1 text-sm text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={sendEmail}
                disabled={sending || !emailTo.trim() || !emailBody.trim()}
                className="rounded bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send email"}
              </button>
              {thread?.requestNumber && (
                <span className="text-[10px] text-zinc-500">Request #{thread.requestNumber}</span>
              )}
              <button type="button" onClick={() => setEmailOpen(false)} className="text-xs text-white/40 hover:text-white">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => act("confirm")}
          disabled={busy !== null}
          className="rounded-md p-1.5 text-green-500 hover:bg-zinc-800 disabled:opacity-50"
          title="Confirm this owner edit (sets status=confirmed, confidence=100)"
        >
          {busy === "confirm" ? (
            <span className="text-xs px-1">…</span>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,8.5 7,12 13,4.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={runAiCheck}
          disabled={aiBusy || busy !== null}
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400 hover:bg-zinc-800 disabled:opacity-50"
          title="Run an AI check: searches public data and returns a confidence that this claim is verifiable"
        >
          {aiBusy ? "Checking…" : "Run AI Check"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditReason(curReason);
            setEditPoints(String(curPoints));
            setEditing((v) => !v);
          }}
          disabled={busy !== null}
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          title="Edit this claim's text/points before publishing"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5l2 2L6 12l-3 1 1-3z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={toggleEmail}
          disabled={busy !== null}
          className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-zinc-800 disabled:opacity-50 ${emailOpen ? "text-indigo-300" : "text-indigo-400"}`}
          title="Email this user about their claim; replies thread back here"
        >
          Email User
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={busy !== null}
          className="rounded-md p-1.5 text-red-500 hover:bg-zinc-800 disabled:opacity-50"
          title="Reject this owner edit (sets status=rejected, confidence=0)"
        >
          {busy === "reject" ? (
            <span className="text-xs px-1">…</span>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          )}
        </button>
      </div>
    </li>
  );
}
