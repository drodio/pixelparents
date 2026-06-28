"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { LeaderboardRow } from "@/lib/leaderboard";
import { ProfileMiniTable } from "@/components/events/ProfileMiniTable";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";
import { SectionHeading } from "@/components/SectionHeading";

const DEFAULT_SHOWN = 10;

type ConnStatus = "none" | "pending_out" | "pending_in" | "approved" | "denied";
export type Conn = { status: ConnStatus; contact: { email: string | null; linkedin: string | null } | null };

// Event attendees in leaderboard format (shared ProfileMiniTable). Claimed
// viewers see everything and rows link to the profile; unclaimed viewers get it
// blurred with rows linking to claim/score (/?find=1). When the viewer is an
// attendee (slug + connectionByEval provided), each row also gets a Connect
// button + connection state — this is the (former) Attendee hub, folded in.
export function AttendeesTable({
  rows,
  unmatchedNames,
  isClaimed,
  slug,
  viewerEvalId,
  connectionByEval,
  belowTitle,
  upcoming = false,
}: {
  rows: LeaderboardRow[];
  unmatchedNames: string[];
  isClaimed: boolean;
  slug?: string;
  viewerEvalId?: string | null;
  connectionByEval?: Record<string, Conn>;
  // Rendered directly under the "Attendees" title, before the table (e.g. the
  // per-event "allow connection requests?" control).
  belowTitle?: ReactNode;
  // Tense for the unclaimed-viewer prompt: upcoming → "Are you attending…",
  // past → "Did you attend…".
  upcoming?: boolean;
}) {
  const canConnect = !!slug && !!connectionByEval;
  const [conns, setConns] = useState<Record<string, Conn>>(connectionByEval ?? {});
  const [busy, setBusy] = useState<string | null>(null);

  // Split attendees into "active connections" (approved, or contact already
  // shared) and everyone-else. Active connections render in their own "Your
  // connections" table above; the lower table is purely people you can still
  // connect with. Both score-desc. Recomputes as connections change. When the
  // viewer can't connect (not an attendee), everything stays in the lower table.
  const { activeRows, connectableRows } = useMemo(() => {
    const isActive = (id: string) => {
      const c = conns[id];
      return c?.status === "approved" || !!c?.contact;
    };
    const sorted = [...rows].sort((a, b) => (b.combinedScore ?? 0) - (a.combinedScore ?? 0));
    if (!canConnect) return { activeRows: [] as LeaderboardRow[], connectableRows: sorted };
    const active: LeaderboardRow[] = [];
    const connectable: LeaderboardRow[] = [];
    for (const r of sorted) {
      // The viewer themself is never an "active connection".
      if (viewerEvalId && r.id === viewerEvalId) connectable.push(r);
      else if (isActive(r.id)) active.push(r);
      else connectable.push(r);
    }
    return { activeRows: active, connectableRows: connectable };
  }, [rows, conns, canConnect, viewerEvalId]);

  if (rows.length === 0 && unmatchedNames.length === 0) return null;

  async function connect(toId: string) {
    if (!slug) return;
    setBusy(toId);
    try {
      const res = await fetch(`/api/events/${slug}/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toEvaluationId: toId }),
      });
      const data = await res.json();
      if (res.ok) {
        const next: ConnStatus =
          data.status === "approved" ? "approved" : data.status === "denied" ? "denied" : "pending_out";
        setConns((c) => ({ ...c, [toId]: { status: next, contact: c[toId]?.contact ?? null } }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(toId: string) {
    if (!slug) return;
    setBusy(toId);
    try {
      const res = await fetch(`/api/events/${slug}/connect`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toEvaluationId: toId }),
      });
      if (res.ok) {
        // Back to unconnected — the row re-shows a "Connect" button (reconnect).
        setConns((c) => ({ ...c, [toId]: { status: "none", contact: null } }));
      }
    } finally {
      setBusy(null);
    }
  }

  function rowAction(row: LeaderboardRow) {
    if (viewerEvalId && row.id === viewerEvalId) return <span className="text-xs text-zinc-600">You</span>;
    const c = conns[row.id] ?? { status: "none", contact: null };
    if (c.status === "approved" || c.contact) {
      // Green "Connected"; on hover it turns red and reads "Disconnect". Click
      // removes the connection (the row reverts to a "Connect" button).
      return (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => disconnect(row.id)}
            disabled={busy === row.id}
            className="group rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            {busy === row.id ? (
              "…"
            ) : (
              <>
                <span className="group-hover:hidden">Connected</span>
                <span className="hidden group-hover:inline">Disconnect</span>
              </>
            )}
          </button>
          {c.contact && (c.contact.email || c.contact.linkedin) && (
            <div className="flex flex-col items-end gap-0.5 text-xs text-zinc-400">
              {c.contact.email && (
                <a href={`mailto:${c.contact.email}`} className="hover:text-zinc-200">
                  Email
                </a>
              )}
              {c.contact.linkedin && (
                <a href={c.contact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-200">
                  LinkedIn <ExternalLinkIcon className="ml-0.5" />
                </a>
              )}
            </div>
          )}
        </div>
      );
    }
    if (c.status === "pending_out")
      return (
        <span className="rounded-md border border-blue-400/60 px-3 py-1 text-xs text-blue-400">
          Pending
        </span>
      );
    if (c.status === "pending_in") return <span className="text-xs text-amber-400">Wants to connect</span>;
    if (c.status === "denied") return <span className="text-xs text-zinc-600">—</span>;
    return (
      <button
        type="button"
        onClick={() => connect(row.id)}
        disabled={busy === row.id}
        className="rounded-md border border-[#dfa43a] px-3 py-1 text-xs text-[#dfa43a] hover:bg-[#dfa43a]/10 disabled:opacity-50"
      >
        {busy === row.id ? "…" : "Connect"}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading label="Attendees" className="font-display text-2xl font-semibold" />
      {belowTitle}
      {!isClaimed && (
        <div className="flex flex-col gap-1 text-sm text-zinc-400">
          <p>
            <Link href="/?find=1" className="text-[#dfa43a] hover:underline">
              Become a Festival member
            </Link>{" "}
            to see the attendee list.
          </p>
          <p>
            {upcoming ? "Are you attending this event?" : "Did you attend this event?"} Claim{" "}
            <Link href="/?find=1" className="text-[#dfa43a] hover:underline">
              your profile
            </Link>{" "}
            to log in and connect with other attendees.
          </p>
        </div>
      )}
      {canConnect && activeRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeading as="h3" label="Your connections" className="font-display text-lg font-semibold text-emerald-400" />
          <ProfileMiniTable
            rows={activeRows}
            isClaimed={isClaimed}
            defaultShown={DEFAULT_SHOWN}
            rowAction={rowAction}
          />
        </div>
      )}
      {canConnect && activeRows.length > 0 && connectableRows.length > 0 && (
        <SectionHeading as="h3" label="Connect with other attendees" className="mt-2 font-display text-lg font-semibold" />
      )}
      <ProfileMiniTable
        rows={connectableRows}
        unmatchedNames={unmatchedNames}
        isClaimed={isClaimed}
        defaultShown={DEFAULT_SHOWN}
        rowAction={canConnect ? rowAction : undefined}
      />
    </section>
  );
}
