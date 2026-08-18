"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ShareFieldKey, ShareVisibility } from "@/lib/share";
import { setShareFields, setShareVisibility } from "@/lib/share-actions";
import { getShareSetupState, type ShareSetupQuestion } from "./actions";

// The wizard's sharing step, V2 round 2: one question at a time, asked in the
// ORDER the information was entered, and ONLY about information that exists —
// "how can they share information they did not yet fill out."
//
// The question list is fetched when the member clicks Start, not at page load:
// the wizard's earlier steps fill these very fields during the session, so a
// load-time snapshot would wrongly skip anything filled minutes ago.
//
// Q0 is the master switch (list the profile at all?). Yes → visibility "ohs"
// and the per-field questions, each toggling the same share_fields set the
// /account checkbox panel edits — the two surfaces can never disagree. No →
// visibility "private", sequence ends. Editing layout keeps the original panel.

type Phase = "intro" | "loading" | "master" | "fields" | "done";

export function ShareSequence({ signupId }: { signupId: string }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<ShareSetupQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [visibility, setVisibility] = useState<ShareVisibility>("private");
  const [fields, setFields] = useState<ShareFieldKey[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    setError(null);
    setPhase("loading");
    startTransition(async () => {
      const s = await getShareSetupState(signupId);
      if (!s) {
        setError("We couldn't load your info — try again.");
        setPhase("intro");
        return;
      }
      setQuestions(s.questions);
      setVisibility(s.visibility);
      setFields(s.fields);
      setShareUrl(s.shareUrl);
      setQIndex(0);
      setPhase("master");
    });
  }

  function answerMaster(share: boolean) {
    setError(null);
    startTransition(async () => {
      const next: ShareVisibility = share ? "ohs" : "private";
      const r = await setShareVisibility(signupId, next);
      if (r.error) {
        setError(r.error);
        return;
      }
      setVisibility(r.visibility ?? next);
      setPhase(share && questions.length > 0 ? "fields" : "done");
    });
  }

  function answerField(q: ShareSetupQuestion, share: boolean) {
    setError(null);
    const prev = fields;
    const next = share
      ? Array.from(new Set([...fields, ...q.keys]))
      : fields.filter((f) => !q.keys.includes(f));
    setFields(next); // optimistic
    const atEnd = qIndex + 1 >= questions.length;
    setQIndex((i) => i + 1);
    if (atEnd) setPhase("done");
    startTransition(async () => {
      const r = await setShareFields(signupId, next);
      if (r.error) {
        setFields(prev);
        setError(r.error);
        setQIndex((i) => Math.max(0, i - 1));
        setPhase("fields");
      }
    });
  }

  const box = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";
  const btnYes =
    "rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50";
  const btnNo =
    "rounded-full border border-white/20 px-5 py-2 text-sm text-white/75 transition hover:bg-white/10 disabled:opacity-50";

  if (phase === "intro" || phase === "loading") {
    return (
      <div className={box}>
        <h3 className="font-semibold text-white">Choose what you share</h3>
        <p className="mt-1 text-sm text-white/55">
          A few quick questions — one for each piece of info you&apos;ve added.
          Nothing is visible to anyone until you say so.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={phase === "loading" || pending}
          className={`mt-4 ${btnYes}`}
        >
          {phase === "loading" ? "One sec…" : "Choose what's visible →"}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (phase === "master") {
    return (
      <div className={box}>
        <h3 className="font-semibold text-white">
          Do you want your profile listed in the OHS directory?
        </h3>
        <p className="mt-1 text-sm text-white/55">
          Only signed-in, verified OHS families can see the directory. Answer no
          and your profile stays private — you can change this any time.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => answerMaster(true)} className={btnYes}>
            Yes, list my profile
          </button>
          <button type="button" disabled={pending} onClick={() => answerMaster(false)} className={btnNo}>
            No, keep it private
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (phase === "fields" && qIndex < questions.length) {
    const q = questions[qIndex]!;
    return (
      <div className={box}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
          What&apos;s visible · {qIndex + 1} of {questions.length}
        </p>
        <h3 className="mt-2 font-semibold text-white">Share {q.label}?</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={pending} onClick={() => answerField(q, true)} className={btnYes}>
            Share it
          </button>
          <button type="button" disabled={pending} onClick={() => answerField(q, false)} className={btnNo}>
            Keep private
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
      <h3 className="font-semibold text-white">
        {visibility === "ohs" ? "Sharing is set up" : "Your profile is private"}
      </h3>
      <p className="mt-1 text-sm text-white/60">
        {visibility === "ohs"
          ? "You chose exactly what appears in the directory."
          : "Nothing about your family appears in the directory."}{" "}
        Change any of it later from your account page.
      </p>
      {visibility === "ohs" && shareUrl && (
        <p className="mt-3 break-all font-mono text-xs text-white/50">{shareUrl}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={start}
          className="text-white/55 underline underline-offset-2 hover:text-white/85"
        >
          Review my answers
        </button>
        <Link href="/account" className="text-white/55 underline underline-offset-2 hover:text-white/85">
          Full sharing settings
        </Link>
      </div>
    </div>
  );
}
