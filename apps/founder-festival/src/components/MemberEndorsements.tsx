"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2 } from "react-icons/fi";
import { MentionChipInput } from "@/components/MentionChipInput";
import { MentionText } from "@/components/events/chat/MentionText";
import { VisibilitySlider } from "@/components/VisibilitySlider";
import { ClaimProfileModal } from "@/components/ClaimProfileModal";
import {
  ENDORSE_PLACEHOLDER,
  VISIBILITY_OPTIONS,
  allowedPointsVisibilities,
  clampPointsVisibility,
  type Visibility,
} from "@/lib/endorsement-constants";
import type { EndorsementView, PointsBudget } from "@/lib/endorsements";

const visibilityLabel = (v: Visibility): string =>
  VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;

function VisPill({ v }: { v: Visibility }) {
  return (
    <span className="ml-1.5 inline-flex shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
      {visibilityLabel(v)}
    </span>
  );
}

// Popover under the "Profile points" number: total, the top-10 people you've
// endorsed and the points spent on each, and what's remaining.
function PointsBreakdown({
  total,
  available,
  allocations,
  onClose,
}: {
  total: number;
  available: number;
  allocations: { name: string; points: number }[];
  onClose: () => void;
}) {
  const top = allocations
    .filter((a) => a.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  return (
    <span className="absolute left-0 top-full z-30 mt-1 block w-64 rounded-md border border-zinc-700 bg-[#1a1a1a] p-3 text-left shadow-xl">
      <span className="flex items-center justify-between text-xs font-semibold text-zinc-200">
        <span>
          Profile points:{" "}
          <span className="text-[#dfa43a]">{total.toLocaleString("en-US")}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-base leading-none text-zinc-500 hover:text-white">
          ×
        </button>
      </span>
      {top.length > 0 ? (
        <ul className="my-2 flex flex-col gap-0.5">
          {top.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-zinc-300">
              <span className="shrink-0 tabular-nums text-red-400">-{a.points.toLocaleString("en-US")}</span>
              <span className="truncate">{a.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="my-2 text-xs text-zinc-500">You haven&apos;t spent any points yet.</p>
      )}
      <span className="block border-t border-zinc-800 pt-1.5 text-xs font-semibold text-zinc-200">
        Remaining: <span className="text-[#dfa43a]">{available.toLocaleString("en-US")}</span>
      </span>
    </span>
  );
}

export function MemberEndorsements({
  toEvaluationId,
  firstName,
  viewerCanEndorse,
  budget,
  existingPoints,
  endorsements,
  isOwner,
  isAuthed,
  viewerOwnEvaluationId,
  myAllocations = [],
}: {
  toEvaluationId: string;
  firstName: string;
  viewerCanEndorse: boolean;
  budget: PointsBudget;
  existingPoints: number;
  endorsements: EndorsementView[];
  isOwner: boolean;
  isAuthed: boolean;
  viewerOwnEvaluationId: string | null;
  // The viewer's authored endorsements (endorsee name + points), for the
  // compose form's "Profile points" breakdown popover.
  myAllocations?: { name: string; points: number }[];
}) {
  // Nothing to show and the viewer can't add one (e.g. the owner on their own
  // empty profile) → hide the whole section rather than show an empty shell.
  if (endorsements.length === 0 && !viewerCanEndorse) return null;

  // One endorsement per member: if the viewer has already endorsed this person,
  // don't show the "Endorse <name>" compose box — they edit their existing
  // endorsement via the pencil on its card instead.
  const alreadyEndorsed =
    viewerOwnEvaluationId != null &&
    endorsements.some((e) => e.fromEvaluationId === viewerOwnEvaluationId);

  return (
    <section id="member-endorsements" className="w-full flex flex-col gap-4">
      <h2 className="font-display text-xl font-bold tracking-tight">Member Endorsements</h2>

      {endorsements.length > 0 && (
        <ul className="flex flex-col gap-3">
          {endorsements.map((e) => (
            <EndorsementCard
              key={e.id}
              e={e}
              budget={budget}
              isAuthed={isAuthed}
              claimEvaluationId={toEvaluationId}
              firstName={firstName}
              isAuthor={viewerOwnEvaluationId === e.fromEvaluationId}
              // Don't show the upvote box to the endorsee (self-promotion) or to
              // the author of this endorsement (they already set their points).
              canUpvote={!isOwner && viewerOwnEvaluationId !== e.fromEvaluationId}
            />
          ))}
        </ul>
      )}

      {viewerCanEndorse && !alreadyEndorsed && (
        <EndorseForm
          toEvaluationId={toEvaluationId}
          firstName={firstName}
          budget={budget}
          existingPoints={existingPoints}
          myAllocations={myAllocations}
        />
      )}
    </section>
  );
}

function EndorsementCard({
  e,
  budget,
  isAuthed,
  canUpvote,
  claimEvaluationId,
  firstName,
  isAuthor,
}: {
  e: EndorsementView;
  budget: PointsBudget;
  isAuthed: boolean;
  canUpvote: boolean;
  claimEvaluationId: string;
  firstName: string;
  isAuthor: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li
        id={`endorsement-${e.fromEvaluationId}`}
        className="scroll-mt-24 rounded-lg border border-zinc-800 bg-white/[0.02]"
      >
        <EndorseForm
          toEvaluationId={e.toEvaluationId}
          firstName={firstName}
          budget={budget}
          existingPoints={e.authorPoints ?? 0}
          edit={{
            body: e.body,
            points: e.authorPoints ?? 0,
            visibility: e.visibility,
            pointsVisibility: e.pointsVisibility,
            onDone: () => setEditing(false),
          }}
        />
      </li>
    );
  }

  return (
    <li
      id={`endorsement-${e.fromEvaluationId}`}
      className="scroll-mt-24 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-white/[0.02] px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-zinc-300">
          {e.authorPoints != null && (
            <span className="font-semibold text-[#dfa43a]">+{e.authorPoints.toLocaleString("en-US")} pts </span>
          )}
          <span className="text-zinc-500">from </span>
          <a href={e.fromHref} className="font-semibold text-[#dfa43a] hover:underline">
            {e.fromName?.trim() || "A member"}
          </a>
          <VisPill v={e.visibility} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Edit pencil — only the author of this endorsement, to the left of
              the total chiclet. */}
          {isAuthor && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit your endorsement"
              title="Edit your endorsement"
              className="text-zinc-500 hover:text-amber-400"
            >
              <FiEdit2 className="h-4 w-4" aria-hidden />
            </button>
          )}
          {/* Total = author + all co-signs. */}
          <span className="rounded-md border border-[#dfa43a]/40 bg-[#dfa43a]/10 px-2.5 py-1 text-sm font-bold tabular-nums text-[#dfa43a]">
            {e.totalPoints.toLocaleString("en-US")} pts
          </span>
        </div>
      </div>

      <ClampedText body={e.body} />

      {e.contributions.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-zinc-800 pt-2 text-xs text-zinc-400">
          {e.contributions.map((c) => (
            <li key={c.id}>
              <span className="font-semibold text-[#dfa43a]">+{c.points.toLocaleString("en-US")} points </span>
              from{" "}
              <a href={c.fromHref} className="font-semibold text-[#dfa43a] hover:underline">
                {c.fromName?.trim() || "A member"}
              </a>
              <VisPill v={c.visibility} />
            </li>
          ))}
        </ul>
      )}

      {canUpvote && (
        <UpvoteForm
          endorsementId={e.id}
          budget={budget}
          isAuthed={isAuthed}
          claimEvaluationId={claimEvaluationId}
          firstName={firstName}
        />
      )}
    </li>
  );
}

// Clamp the endorsement to ~5 lines with a fade + "Read more" when it overflows.
function ClampedText({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [body]);

  return (
    <div className="relative">
      <div
        ref={ref}
        className={`text-sm leading-relaxed text-zinc-300 ${expanded ? "" : "line-clamp-5"}`}
      >
        <MentionText body={body} />
      </div>
      {!expanded && overflowing && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-5 h-10 bg-gradient-to-t from-[#181818] to-transparent" />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="relative mt-0.5 text-xs font-medium text-[#dfa43a] hover:underline"
          >
            Read more
          </button>
        </>
      )}
    </div>
  );
}

function UpvoteForm({
  endorsementId,
  budget,
  isAuthed,
  claimEvaluationId,
  firstName,
}: {
  endorsementId: string;
  budget: PointsBudget;
  isAuthed: boolean;
  claimEvaluationId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [pointsStr, setPointsStr] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  const max = budget.available;

  async function submit() {
    // Not logged-in / not claimed → the standard Claim Your Profile modal.
    if (!isAuthed) {
      setClaimOpen(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setDone(false);
    try {
      const res = await fetch("/api/endorsements/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endorsementId,
          points: Math.max(0, Math.min(Number(pointsStr) || 0, max)),
          visibility,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        // A 401/403 here means an authed-but-unclaimed user — show the modal.
        if (res.status === 401 || res.status === 403) {
          setClaimOpen(true);
          return;
        }
        setMsg(data.error || `Error ${res.status}`);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-zinc-800 pt-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-300">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="text-[#dfa43a]">↑</span>
          Upvote this endorsement by adding
        </span>
        <input
          type="number"
          min={0}
          max={isAuthed ? max : undefined}
          value={pointsStr}
          onChange={(ev) => setPointsStr(ev.target.value)}
          className="w-20 rounded-md border border-[#dfa43a] bg-[#dfa43a]/[0.06] px-2 py-1 text-sm font-semibold text-[#dfa43a] focus:outline-none focus:ring-1 focus:ring-[#dfa43a]"
        />
        <span>of your Festival points to it.</span>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-[#dfa43a] px-3 py-1.5 text-sm font-medium text-black hover:bg-[#e8b452] disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
        {msg && <span className="text-xs text-amber-300">{msg}</span>}
        {done && !msg && <span className="text-xs text-emerald-400">Added!</span>}
      </div>
      <VisibilitySlider value={visibility} onChange={setVisibility} ariaLabel="Upvote visibility" />
      <ClaimProfileModal
        open={claimOpen}
        onClose={() => setClaimOpen(false)}
        evaluationId={claimEvaluationId}
        initialBanner={null}
        firstName={firstName}
      />
    </div>
  );
}

function EndorseForm({
  toEvaluationId,
  firstName,
  budget,
  existingPoints,
  edit,
  myAllocations = [],
}: {
  toEvaluationId: string;
  firstName: string;
  budget: PointsBudget;
  existingPoints: number;
  myAllocations?: { name: string; points: number }[];
  // When present, the form edits an existing endorsement (pre-filled, always
  // open, "Save" + Cancel) instead of composing a new one.
  edit?: {
    body: string;
    points: number;
    visibility: Visibility;
    pointsVisibility: Visibility;
    onDone: () => void;
  };
}) {
  const router = useRouter();
  const isEdit = !!edit;
  const [open, setOpen] = useState(isEdit);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [body, setBody] = useState(edit?.body ?? "");
  const [visibility, setVisibility] = useState<Visibility>(edit?.visibility ?? "public");
  const [pointsVisibility, setPointsVisibility] = useState<Visibility>(edit?.pointsVisibility ?? "public");
  const [points, setPoints] = useState(edit?.points ?? existingPoints ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const maxPoints = budget.available + (edit?.points ?? existingPoints);

  function onVisibility(next: Visibility) {
    setVisibility(next);
    setPointsVisibility((pv) => clampPointsVisibility(pv, next));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/endorsements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toEvaluationId,
          body,
          visibility,
          points: Math.max(0, Math.min(points, maxPoints)),
          pointsVisibility,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      if (isEdit) {
        edit!.onDone();
        router.refresh();
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (typeof window !== "undefined" && !window.confirm(`Delete your endorsement of ${firstName}? This can't be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/endorsements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toEvaluationId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }
      edit?.onDone();
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setDeleting(false);
    }
  }

  const canSave = body.trim().length > 0 && !saving;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#dfa43a]/30 bg-[#dfa43a]/[0.04] px-4 py-4">
      {isEdit ? (
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-zinc-100">Edit your endorsement</h3>
          <button
            type="button"
            onClick={() => edit!.onDone()}
            className="text-sm text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left font-display text-lg font-semibold text-zinc-100"
        >
          <span aria-hidden className="text-base text-[#dfa43a]">{open ? "▾" : "▸"}</span>
          Endorse {firstName}
        </button>
      )}
      {open && (
        <>
      <MentionChipInput onBody={setBody} initialBody={edit?.body} placeholder={ENDORSE_PLACEHOLDER(firstName)} />

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Endorsement visibility</span>
        <VisibilitySlider value={visibility} onChange={onVisibility} ariaLabel="Endorsement visibility" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-zinc-300">
          You have{" "}
          <span className="relative inline-block">
            <button
              type="button"
              onClick={() => setPointsOpen((o) => !o)}
              title="See your Profile points breakdown"
              className="font-semibold text-[#dfa43a] underline decoration-dotted underline-offset-2 hover:brightness-125"
            >
              {maxPoints.toLocaleString("en-US")}
            </button>
            {pointsOpen && (
              <PointsBreakdown
                total={budget.total}
                available={budget.available}
                allocations={myAllocations}
                onClose={() => setPointsOpen(false)}
              />
            )}
          </span>{" "}
          Profile points available to use across all your endorsements. How many would you
          like to apply to {firstName}?
        </label>
        <input
          type="number"
          min={0}
          max={maxPoints}
          // Empty (not a default "0") when nothing's been entered yet.
          value={points === 0 ? "" : points}
          onChange={(e) => setPoints(Math.max(0, Math.min(Number(e.target.value) || 0, maxPoints)))}
          className="w-28 rounded-md border border-[#dfa43a] bg-[#dfa43a]/[0.06] px-3 py-2 text-sm font-semibold text-[#dfa43a] focus:outline-none focus:ring-1 focus:ring-[#dfa43a]"
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Points visibility</span>
          <VisibilitySlider
            value={pointsVisibility}
            onChange={setPointsVisibility}
            allowed={allowedPointsVisibilities(visibility)}
            ariaLabel="Points visibility"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canSave || deleting}
          onClick={save}
          className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-medium text-black hover:bg-[#e8b452] disabled:opacity-40"
        >
          {saving ? "Saving…" : isEdit ? "Save" : "Endorse"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
        {done && !error && <span className="text-xs text-emerald-400">Endorsement saved.</span>}
        {isEdit && (
          <button
            type="button"
            disabled={saving || deleting}
            onClick={remove}
            className="ml-auto rounded-md border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
        </>
      )}
    </div>
  );
}
