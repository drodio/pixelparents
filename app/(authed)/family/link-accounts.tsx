"use client";

import { useState, useTransition } from "react";
import {
  requestFamilyLinkAction,
  approveFamilyLinkAction,
  declineFamilyLinkAction,
  cancelFamilyLinkAction,
} from "./actions";

export type IncomingLink = {
  id: string;
  fromName: string | null;
  fromIsStudent: boolean;
  movingCount: number;
  movingNames: string[];
  movingHasOtherAdults: boolean;
};

export type OutgoingLink = { id: string; toEmail: string };

const inputCls =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/60";

// Link an existing account into this family, and act on requests from others.
//
// Rendered on /family (manage anytime) and on the student's post-signup step
// (where it replaces "invite your parent" when the parent already has an
// account). Same component, so the two surfaces can't drift.
export function LinkAccounts({
  incoming,
  outgoing,
  compact = false,
}: {
  incoming: IncomingLink[];
  outgoing: OutgoingLink[];
  // Trims the copy for the signup step, where the surrounding page already
  // explains what's going on.
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const value = email.trim();
    if (!value) return;
    setNote(null);
    start(async () => {
      const r = await requestFamilyLinkAction(value);
      setNote({ ok: r.ok, text: r.message });
      if (r.ok) setEmail("");
    });
  }

  function act(fn: (id: string) => Promise<{ ok: boolean; message: string }>, id: string) {
    setNote(null);
    start(async () => {
      const r = await fn(id);
      setNote({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Requests waiting on US. Shown first — someone is blocked on this. */}
      {incoming.length > 0 && (
        <section className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <h3 className="text-sm font-semibold text-white">
            {incoming.length === 1 ? "Someone wants to link" : `${incoming.length} link requests`}
          </h3>
          <ul className="mt-3 flex flex-col gap-3">
            {incoming.map((r) => (
              <li key={r.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm text-white/85">
                  <span className="font-semibold">{r.fromName ?? "Someone"}</span>
                  {r.fromIsStudent ? " (an OHS student)" : ""} wants to join your family.
                </p>
                {/* Name everyone who moves — a co-parent must never be
                    relocated invisibly by someone else's approval. */}
                <p className="mt-1 text-xs text-white/55">
                  {r.movingCount === 1
                    ? "They'll join your family and you'll share profile and child info."
                    : `${r.movingCount} people will join your family: ${r.movingNames.join(", ")}.`}
                </p>
                {r.movingHasOtherAdults && (
                  <p className="mt-1 text-xs text-amber-300/90">
                    Heads up: this moves more than one adult account into your family.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(approveFamilyLinkAction, r.id)}
                    className="rounded-full bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
                  >
                    Approve &amp; link
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(declineFamilyLinkAction, r.id)}
                    className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/75 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        {!compact && (
          <>
            <h3 className="text-sm font-semibold text-white">Link an existing account</h3>
            <p className="mt-1 text-xs text-white/55">
              Already have a parent, co-parent, or student with their own GoPixel account?
              Enter their email and they&apos;ll get a request to approve. Once they accept,
              you&apos;re one family.
            </p>
          </>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="their@email.com"
            className={inputCls}
          />
          <button
            type="button"
            disabled={pending || !email.trim()}
            onClick={submit}
            className="shrink-0 rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send request"}
          </button>
        </div>

        {note && (
          <p
            className={`mt-2 text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`}
            aria-live="polite"
          >
            {note.text}
          </p>
        )}
      </section>

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-white/80">Waiting on approval</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {outgoing.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-white/70">{r.toEmail}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(cancelFamilyLinkAction, r.id)}
                  className="text-xs text-white/50 underline hover:text-white/80 disabled:opacity-50"
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
