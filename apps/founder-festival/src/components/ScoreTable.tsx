"use client";

import { useState, useTransition } from "react";
import { sanitizeReason } from "@/lib/scoring";
import { ClaimProfileModal } from "./ClaimProfileModal";
import { ReasonWithCitations } from "./ReasonWithCitations";

export type ScoreItemStatus = "likely" | "pending" | "confirmed" | "rejected";

export type ScoreItemRow = {
  id: string;
  points: number;
  reason: string;
  source: "system" | "user";
  status: ScoreItemStatus;
  confidence: number;
  // Per-phrase citations. Empty for rows scored before this feature
  // shipped (or user-added rows) — those render as plain text.
  citations: Array<{ phrase: string; sources: string[] }>;
};

type Props = {
  founder: ScoreItemRow[];
  investor: ScoreItemRow[];
  isCodeEntry?: boolean;
  evaluationId: string;
  // True when the current Clerk session owns this evaluation (high or medium
  // identity-match claim).
  isOwner: boolean;
  // True when *anyone* has claimed this profile (high/medium match), not just
  // the current viewer. Once claimed, the "Are you {firstName}? Claim this
  // profile…" CTA is suppressed for everyone — there's nothing left to claim.
  isClaimedByAnyone?: boolean;
  // True when the owner hasn't finished registration (primary email or phone
  // still missing on Clerk). Dispute UI is hidden until setup completes —
  // clicking any action routes to /account/setup instead.
  ownerNeedsSetup?: boolean;
  // Subject's full name (from the eval row or its profile blob). Used to
  // personalize the non-owner CTA: "Are you {firstName}? Claim this profile…"
  fullName?: string | null;
  // True when the current viewer is in ADMIN_EMAILS. Admins see the same
  // ✓/✏/✗ actions an owner sees plus an "Admin" pill on each row, even when
  // they don't own the profile. Admins are also the only ones who can resolve
  // pending items per the API gating in /api/score-items/[id]/route.ts.
  isAdminViewer?: boolean;
};

// Color tiers per the user's spec:
//   100% confirmed → green check (no % digits — the ✓ implies certainty)
//   75-99%        → blue circle with "NN%" label
//   50-74%        → orange circle with "NN%" label
//   0-49%         → red circle (with strike-through on the text)
//   rejected      → red circle, 0%, strike-through
// `source: "user"` rows that are pending get a yellow "Pending" pill instead
// of a circle so the admin queue can spot owner-modified rows at a glance.
// Tooltip on every circle reads "Probability of being accurate (NN%)".
// Reusable hover bubble for circle tooltips. Native `title` has a 1-2s
// browser delay that makes it feel broken; this shows immediately on hover.
function CircleTooltip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-9 z-20 whitespace-nowrap rounded-md bg-black/90 border border-zinc-700 px-2 py-1 text-[10px] text-zinc-100 opacity-0 group-hover/circle:opacity-100 transition-opacity duration-100 shadow-lg"
    >
      {text}
    </span>
  );
}

function ConfidenceCircle({ row }: { row: ScoreItemRow }) {
  if (row.status === "confirmed") {
    return (
      <span className="relative group/circle shrink-0 mt-0.5">
        <span
          aria-label="Confirmed (100%) — probability of being accurate"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-white"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,8.5 7,12 13,4.5" />
          </svg>
        </span>
        <CircleTooltip text="Probability of being accurate (100%)" />
      </span>
    );
  }
  if (row.status === "pending") {
    return (
      <span className="relative group/circle shrink-0 mt-0.5">
        <span
          aria-label="Pending admin review"
          className="inline-flex h-7 px-2 items-center justify-center rounded-md bg-[#dfa43a] text-black text-[10px] font-semibold uppercase tracking-wider"
        >
          Pending
        </span>
        <CircleTooltip text="Pending admin review" />
      </span>
    );
  }
  const c = row.status === "rejected" ? 0 : row.confidence;
  return (
    <span className="relative group/circle shrink-0 mt-0.5">
      <span
        aria-label={`Probability of being accurate (${c}%)`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white text-[10px] font-semibold tabular-nums"
        style={{ backgroundColor: bgForConfidence(c) }}
      >
        {c}%
      </span>
      <CircleTooltip text={`Probability of being accurate (${c}%)`} />
    </span>
  );
}

// Linear hex interpolation between two #RRGGBB colors. t in [0, 1].
function hexLerp(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const lerp = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  const r = lerp((pa >> 16) & 0xff, (pb >> 16) & 0xff);
  const g = lerp((pa >> 8) & 0xff, (pb >> 8) & 0xff);
  const bl = lerp(pa & 0xff, pb & 0xff);
  return "#" + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0");
}

// Graduated color per confidence value. Within each band the shade steps
// every 5% from light (low end of band) → dark (high end of band), so the
// difference between a 75% and a 95% blue circle is visually distinguishable.
function bgForConfidence(c: number): string {
  const stepped = Math.floor(c / 5) * 5; // snap to 5% step
  if (stepped >= 75) {
    // Blue band: 75 → 95 maps to blue-400 → blue-800
    const t = Math.min(1, (stepped - 75) / 20);
    return hexLerp("#60a5fa", "#1e40af", t);
  }
  if (stepped >= 50) {
    // Orange band: 50 → 70 maps to orange-400 → orange-800
    const t = Math.min(1, (stepped - 50) / 20);
    return hexLerp("#fb923c", "#9a3412", t);
  }
  // Red band: 0 → 45 maps to red-300 → red-900
  const t = Math.min(1, stepped / 45);
  return hexLerp("#fca5a5", "#7f1d1d", t);
}

// Small purple pill shown next to an action when the viewer is acting as an
// admin on a profile (admin override). Shown on confirm/modify/reject rows and
// on the "+Add" action so it's clear the action is taken via admin powers.
function AdminPill() {
  return (
    <span
      title="You can take this action because you're an admin"
      className="ml-1 inline-flex items-center rounded-md bg-purple-600/30 border border-purple-500/60 text-purple-200 text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5"
    >
      Admin
    </span>
  );
}

type RowState = ScoreItemRow & { editing?: boolean; draftReason?: string; saving?: boolean };

function ItemRow({
  row,
  isAdminViewer,
  canDirectlyAct,
  ownerNeedsSetup,
  onRoute,
  onClaimNeeded,
  onUpdated,
}: {
  row: RowState;
  isAdminViewer: boolean;
  // True when the viewer can hit the API directly without needing to claim
  // first — i.e. they're the verified owner or an admin. False for anonymous
  // visitors and signed-in-but-unclaimed visitors: their action clicks open
  // the Claim Profile modal via onClaimNeeded() instead of POSTing.
  canDirectlyAct: boolean;
  ownerNeedsSetup: boolean;
  onRoute: () => void;
  onClaimNeeded: () => void;
  onUpdated: (next: ScoreItemRow) => void;
}) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState(row.reason);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  async function call(
    body: { action: "confirm" } | { action: "reject" } | { action: "modify"; reason: string },
  ) {
    // Anonymous / unclaimed visitor → invite them to claim first; once
    // they're owner-verified the dispute flow opens for real.
    if (!canDirectlyAct) {
      onClaimNeeded();
      return;
    }
    if (ownerNeedsSetup) {
      onRoute();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/score-items/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.item) {
        startTransition(() => onUpdated(json.item));
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  const isRejected = row.status === "rejected";
  const reasonClass = `flex-1 ${isRejected ? "line-through text-zinc-500" : ""}`;

  return (
    <li className="group flex items-start gap-3 text-sm text-zinc-300">
      <ConfidenceCircle row={row} />
      {editing ? (
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            autoFocus
          />
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => call({ action: "modify", reason: draft })}
              disabled={saving || draft.trim().length === 0}
              className="rounded-md bg-[#dfa43a] text-black font-medium px-3 py-1 hover:bg-[#e8b452] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save (pending review)"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(row.reason);
              }}
              className="rounded-md border border-zinc-700 text-zinc-300 px-3 py-1 hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <span className={reasonClass}>
          {row.citations && row.citations.length > 0 ? (
            <ReasonWithCitations
              reason={sanitizeReason(row.reason)}
              citations={row.citations}
            />
          ) : (
            sanitizeReason(row.reason)
          )}
        </span>
      )}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => call({ action: "confirm" })}
            disabled={saving}
            aria-label="Confirm this item"
            title="Confirm"
            className="rounded-md p-1 text-green-500 hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3,8.5 7,12 13,4.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canDirectlyAct) {
                onClaimNeeded();
                return;
              }
              if (ownerNeedsSetup) {
                onRoute();
                return;
              }
              setEditing(true);
            }}
            disabled={saving}
            aria-label="Modify this item"
            title="Modify"
            className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.5l1.5 1.5-8 8H4v-1.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => call({ action: "reject" })}
            disabled={saving}
            aria-label="Reject this item"
            title="Reject"
            className="rounded-md p-1 text-red-500 hover:bg-zinc-800"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
          {isAdminViewer && <AdminPill />}
        </div>
      )}
    </li>
  );
}

function AddItemRow({
  rubric,
  evaluationId,
  isOwner,
  isAdminViewer,
  ownerNeedsSetup,
  onRoute,
  onClaimNeeded,
  onAdded,
}: {
  rubric: "founder" | "investor";
  evaluationId: string;
  // Owner of THIS profile. A non-owner must claim + register before adding.
  isOwner: boolean;
  // Admins can add on ANY profile (admin override) without claiming — same as
  // their confirm/modify/reject powers in ItemRow. An "Admin" pill marks it.
  isAdminViewer: boolean;
  ownerNeedsSetup: boolean;
  onRoute: () => void;
  onClaimNeeded: () => void;
  onAdded: (item: ScoreItemRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onPlus() {
    // Admins can act on any profile (admin override) — no claim/registration.
    if (isAdminViewer) {
      setEditing(true);
      return;
    }
    // Otherwise the viewer must claim + verify ownership of THIS profile.
    if (!isOwner) {
      onClaimNeeded();
      return;
    }
    // Claimed but registration (email/phone on Clerk) isn't finished yet.
    if (ownerNeedsSetup) {
      onRoute();
      return;
    }
    setEditing(true);
  }
  async function save() {
    if (!draft.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      // No points sent — the owner only proposes the item; an admin assigns
      // the point value later during pending review.
      const res = await fetch("/api/score-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluationId,
          rubric,
          reason: draft.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.item) {
        onAdded(json.item);
        setDraft("");
        setEditing(false);
      } else {
        setErr(json.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    // Hidden by default; only appears when the user hovers anywhere in the
    // rubric Section (group/rubric, set on the Section's container) or
    // tab-focuses the button. The Section's ul height shrinks correspondingly
    // so an idle rubric doesn't reserve dead space.
    return (
      <li className="flex items-center gap-3 text-sm text-zinc-500 opacity-0 group-hover/rubric:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onPlus}
          aria-label={`Add another ${rubric} item`}
          title={`Add another ${rubric} item (pending admin review)`}
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-zinc-600 text-zinc-500 hover:text-white hover:border-zinc-400 transition-colors"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
        {isAdminViewer && <AdminPill />}
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 text-sm text-zinc-300">
      <span
        className="shrink-0 mt-0.5 inline-flex h-7 px-2 items-center justify-center rounded-md bg-[#dfa43a] text-black text-[10px] font-semibold uppercase tracking-wider"
        title="Will be marked pending admin review"
      >
        Pending
      </span>
      <div className="flex-1 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={`Add a ${rubric} signal — what should we know?`}
          className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
          autoFocus
        />
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={save}
            disabled={saving || draft.trim().length === 0}
            className="rounded-md bg-[#dfa43a] text-black font-medium px-3 py-1 hover:bg-[#e8b452] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save (pending review)"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft("");
              setErr(null);
            }}
            className="rounded-md border border-zinc-700 text-zinc-300 px-3 py-1 hover:border-zinc-500"
          >
            Cancel
          </button>
          {isAdminViewer && <AdminPill />}
        </div>
        {err && <p className="text-xs text-red-400">Error: {err}</p>}
      </div>
    </li>
  );
}

function Section({
  title,
  rubric,
  evaluationId,
  rows,
  isAdminViewer,
  isOwner,
  canDirectlyAct,
  ownerNeedsSetup,
  onRoute,
  onClaimNeeded,
  onUpdated,
  onAdded,
}: {
  title: string;
  rubric: "founder" | "investor";
  evaluationId: string;
  rows: ScoreItemRow[];
  isAdminViewer: boolean;
  // Owner of THIS profile (gates adding new items — stricter than canDirectlyAct).
  isOwner: boolean;
  canDirectlyAct: boolean;
  ownerNeedsSetup: boolean;
  onRoute: () => void;
  onClaimNeeded: () => void;
  onUpdated: (next: ScoreItemRow) => void;
  onAdded: (next: ScoreItemRow) => void;
}) {
  // Sort by confidence descending — confirmed (100) on top, likely (Claude's
  // emitted value) in the middle, rejected (treated as 0) at the bottom.
  // Points descending breaks ties so big-impact items still bubble up among
  // same-confidence rows.
  const confOf = (r: ScoreItemRow) => (r.status === "rejected" ? 0 : r.confidence);
  const sorted = [...rows].sort((a, b) => confOf(b) - confOf(a) || b.points - a.points);
  return (
    // `group/rubric` so the trailing AddItemRow's "+" circle can hide until
    // the user hovers somewhere in this rubric. Each Section (founder /
    // investor) is its own hover scope so showing the + on one doesn't
    // reveal the other.
    <div className="flex flex-col gap-2 group/rubric">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 italic">No signal on this dimension.</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {sorted.map((r) => (
          <ItemRow
            key={r.id}
            row={r}
            isAdminViewer={isAdminViewer}
            canDirectlyAct={canDirectlyAct}
            ownerNeedsSetup={ownerNeedsSetup}
            onRoute={onRoute}
            onClaimNeeded={onClaimNeeded}
            onUpdated={onUpdated}
          />
        ))}
        <AddItemRow
          rubric={rubric}
          evaluationId={evaluationId}
          isOwner={isOwner}
          isAdminViewer={isAdminViewer}
          ownerNeedsSetup={ownerNeedsSetup}
          onRoute={onRoute}
          onClaimNeeded={onClaimNeeded}
          onAdded={onAdded}
        />
      </ul>
    </div>
  );
}

export function ScoreTable({
  founder,
  investor,
  isCodeEntry,
  evaluationId,
  isOwner,
  isClaimedByAnyone,
  ownerNeedsSetup,
  fullName,
  isAdminViewer,
}: Props) {
  const firstName = (fullName ?? "").trim().split(/\s+/)[0] || null;
  const [claimOpen, setClaimOpen] = useState(false);
  const [founderRows, setFounderRows] = useState(founder);
  const [investorRows, setInvestorRows] = useState(investor);

  // ✓ / ✏ / ✗ icons appear on hover for EVERY visitor. What the click does
  // branches on identity:
  //   - anonymous / signed-in-but-unclaimed → open Claim Profile modal
  //   - owner-needs-setup → route to /account/setup
  //   - owner (registered) → POST /api/score-items
  //   - admin → POST /api/score-items + small "Admin" pill on each row
  const canDirectlyAct = !!isOwner || !!isAdminViewer;
  function onRouteToSetup() {
    window.location.href = "/account/setup";
  }
  function onClaimNeeded() {
    setClaimOpen(true);
  }

  function patchRow(next: ScoreItemRow, list: ScoreItemRow[]) {
    return list.map((r) => (r.id === next.id ? { ...r, ...next } : r));
  }

  if (isCodeEntry) {
    return (
      <div className="text-zinc-500 text-sm italic text-center">
        You&apos;re in via invite code.
      </div>
    );
  }
  return (
    <>
      <ClaimProfileModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        evaluationId={evaluationId}
        firstName={firstName}
      />
      <div className="w-full max-w-2xl flex flex-col gap-8">
        {/* Hide a dimension with no signals entirely (e.g. an investor-less
            founder shows only the Founder score), rather than an empty header. */}
        {founder.length > 0 && (
        <Section
          title="Founder score"
          rubric="founder"
          evaluationId={evaluationId}
          rows={founderRows}
          isOwner={!!isOwner}
          canDirectlyAct={canDirectlyAct}
          isAdminViewer={!!isAdminViewer}
          ownerNeedsSetup={!!ownerNeedsSetup}
          onRoute={onRouteToSetup}
          onClaimNeeded={onClaimNeeded}
          onUpdated={(next) => {
            setFounderRows((rows) => patchRow(next, rows));
            setInvestorRows((rows) => patchRow(next, rows));
          }}
          onAdded={(item) => setFounderRows((rows) => [...rows, item])}
        />
        )}
        {investor.length > 0 && (
        <Section
          title="Investor score"
          rubric="investor"
          evaluationId={evaluationId}
          rows={investorRows}
          isOwner={!!isOwner}
          canDirectlyAct={canDirectlyAct}
          isAdminViewer={!!isAdminViewer}
          ownerNeedsSetup={!!ownerNeedsSetup}
          onRoute={onRouteToSetup}
          onClaimNeeded={onClaimNeeded}
          onUpdated={(next) => {
            setFounderRows((rows) => patchRow(next, rows));
            setInvestorRows((rows) => patchRow(next, rows));
          }}
          onAdded={(item) => setInvestorRows((rows) => [...rows, item])}
        />
        )}
        {!isOwner && !isClaimedByAnyone && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setClaimOpen(true)}
              className="link text-sm"
            >
              {firstName ? (
                <>
                  <strong>Are you {firstName}?</strong> Claim this profile to add, edit or delete items.
                </>
              ) : (
                <>Claim this profile to add, edit or delete items.</>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
