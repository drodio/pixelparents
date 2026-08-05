"use client";

import { useState, useTransition } from "react";
import { DURATION_OPTIONS } from "@/lib/enforcement";
import { applyEnforcementAction, revokeEnforcementAction } from "./actions";

const inputCls =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/60";

// Apply a moderation action to one member.
//
// A reason is REQUIRED — an unexplained mute or ban is indefensible if the
// member challenges it, and the reason is what the member is shown when they
// next try to post. The duration select only appears for mute/ban, since delete
// and note are point-in-time events with nothing to expire.
export function EnforceForm({
  signupId,
  subjectName,
}: {
  signupId: string;
  subjectName: string;
}) {
  const [kind, setKind] = useState<"mute" | "ban" | "delete" | "note">("mute");
  const [hours, setHours] = useState<string>("24");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const isRestriction = kind === "mute" || kind === "ban";

  function submit() {
    if (!reason.trim()) {
      setNote({ ok: false, text: "A reason is required." });
      return;
    }
    setNote(null);
    start(async () => {
      const r = await applyEnforcementAction({
        signupId,
        kind,
        reason,
        durationHours: isRestriction ? (hours === "perm" ? null : Number(hours)) : null,
      });
      setNote({ ok: r.ok, text: r.message });
      if (r.ok) setReason("");
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-white">
        Take action on {subjectName}
      </h3>

      <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_10rem_1fr_auto]">
        <select
          aria-label="Action"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={inputCls}
        >
          <option value="mute">Mute (no posting)</option>
          <option value="ban">Ban (no access)</option>
          <option value="delete">Content delete</option>
          <option value="note">Note only</option>
        </select>

        {isRestriction ? (
          <select
            aria-label="Duration"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className={inputCls}
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d.label} value={d.hours == null ? "perm" : String(d.hours)}>
                {d.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="hidden sm:block" />
        )}

        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required — shown to the member)"
          className={inputCls}
        />

        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-40"
        >
          {pending ? "…" : "Apply"}
        </button>
      </div>

      {note && (
        <p className={`mt-2 text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`} aria-live="polite">
          {note.text}
        </p>
      )}
    </div>
  );
}

// Lift an active restriction early.
export function RevokeButton({ actionId }: { actionId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs text-white/40">lifted</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await revokeEnforcementAction(actionId);
          if (r.ok) setDone(true);
        })
      }
      className="text-xs text-amber-400 underline hover:text-amber-300 disabled:opacity-50"
    >
      {pending ? "…" : "Lift"}
    </button>
  );
}
