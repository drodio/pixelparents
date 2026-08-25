"use client";

import { useEffect, useState, useTransition } from "react";
import { requestStudentCode, confirmStudentCode, type VerifyState } from "@/app/signup/thanks/verify-actions";
import { IconCircleCheck, IconGradCap } from "@/components/icons";
import { formatNameList } from "@/lib/verify-copy";
import { useOnboardingGate } from "@/app/signup/thanks/onboarding-gate";

// Optional WhatsApp fallback: a wa.me link (set NEXT_PUBLIC_DRODIO_WHATSAPP_URL
// in env — no phone number is committed to this public repo). Hidden when unset.
const WHATSAPP_URL = process.env.NEXT_PUBLIC_DRODIO_WHATSAPP_URL;

type Step = "method" | "email" | "code" | "approved" | "manual";

// Self-serve "this is a real OHS family" check: the parent enters their OHS
// student's stanford.edu email, we mail a 6-digit code, and confirming it marks
// the family verified (approved for the OHS directory). Drives lib/verify.ts via
// the requestStudentCode / confirmStudentCode server actions.
export function StudentVerify({
  signupId,
  initial,
  compact = false,
  allowAddMore = false,
  studentNames = [],
  methodChoice = false,
  selfVerify = false,
  defaultEmail,
}: {
  signupId: string;
  initial: VerifyState;
  compact?: boolean;
  // When true, the verified ("approved") state offers an "Add another student"
  // button that re-opens the email step — a family can verify many students. Off
  // by default so existing terminal screens (thanks/verify) keep their behavior.
  allowAddMore?: boolean;
  // The OHS-student first name(s) on this family's record. When provided, the
  // prompt copy references the student(s) by name ("Have Maya check her Stanford
  // email…") so it's unambiguous whose email we mean. Empty (the default) keeps
  // the generic "your student" wording, so existing call sites are unaffected.
  studentNames?: readonly string[];
  // Onboarding-wizard mode (V2 round 2): open on a method chooser — email a
  // code (unlocks only on a verified code) vs. message Daniel on WhatsApp
  // (advance immediately, but as unverified, dashboard locked until his manual
  // approval). Off by default so /account and the editing layout are unchanged.
  methodChoice?: boolean;
  // The signing-up member IS the student (student flow) — the code goes to
  // their own OHS email, and the copy says so. Parents (default) are told to
  // enter their child's OHS email.
  selfVerify?: boolean;
  // Pre-fill for the email field when the address is already known — an
  // INVITED student's OHS address is on file from the invite, so they should
  // never have to retype it (round 5 spec).
  defaultEmail?: string;
}) {
  // Resume mid-flow: approved → done; an outstanding code → code step; else the
  // method chooser (wizard mode) or the email step directly.
  const [step, setStep] = useState<Step>(
    initial.status === "approved"
      ? "approved"
      : initial.hasPendingCode
        ? "code"
        : methodChoice && WHATSAPP_URL
          ? "method"
          : "email",
  );

  // Report to the wizard (no-op elsewhere): the member may advance only once
  // verified, or once they've taken the manual WhatsApp path.
  const gate = useOnboardingGate();
  useEffect(() => {
    if (!methodChoice) return;
    gate?.setBlocked("verify", !(step === "approved" || step === "manual"));
  }, [gate, methodChoice, step]);
  const [email, setEmail] = useState(initial.email ?? defaultEmail ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The most-recently verified email this session, for an accurate success line
  // after adding another student (initial.email is the server's last-known one).
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(initial.email ?? null);
  const [notice, setNotice] = useState<string | null>(
    initial.hasPendingCode && initial.email
      ? `We already sent a code to ${initial.email}. Enter it below, or use a different email.`
      : null,
  );
  const [pending, startTransition] = useTransition();

  // Resend countdown (Aug 18 walkthrough): after a send, "Resend code" unlocks
  // in 15s — matching lib/verify's RESEND_COOLDOWN_MS so the button never
  // unlocks into a server "please wait" error. Starts hot when we resume onto
  // an already-pending code (we can't know how long ago that send was).
  const [cooldown, setCooldown] = useState(initial.hasPendingCode ? 15 : 0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // Personalized references to the family's OHS student(s), e.g. "Maya" or
  // "Maya or Ravi". Empty string when we have no names → fall back to generic
  // "your student" copy. `nameList` uses "or" (the family verifies any one of
  // them).
  const nameList = formatNameList(studentNames, "or");
  const hasNames = nameList.length > 0;

  function sendCode() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await requestStudentCode(signupId, email);
      if (!r.ok) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      setStep("code");
      setCooldown(15);
      setNotice(`We sent a 6-digit code to ${r.sentTo ?? email}. It expires in 10 minutes.`);
    });
  }

  function verify() {
    setError(null);
    startTransition(async () => {
      const r = await confirmStudentCode(signupId, code);
      if (!r.ok) {
        setError(r.error ?? "That code didn't match.");
        return;
      }
      setVerifiedEmail(email || null);
      setStep("approved");
      setCode("");
      setNotice(null);
    });
  }

  // Re-open the email step to verify an additional student (account page only).
  function addAnother() {
    setEmail("");
    setCode("");
    setError(null);
    setNotice(null);
    setStep("email");
  }

  const box = compact
    ? "rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5"
    : "rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5 sm:p-6";

  if (step === "approved") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <IconCircleCheck className="h-5 w-5 text-emerald-400" />
          <h3 className="font-semibold text-white">
            {/* Wizard (round 5): plain "Your account has been verified" — the
                member just verified THEIR account, whatever the mechanism.
                Elsewhere (/account), personalize for a single student; several
                names would wrongly imply all were verified in one go. */}
            {methodChoice
              ? "Your account has been verified"
              : studentNames.length === 1
                ? `${studentNames[0]} is verified`
                : "Your OHS student is verified"}
          </h3>
        </div>
        <p className="mt-1.5 text-sm text-white/65">
          {verifiedEmail
            ? `Verified with ${verifiedEmail}.`
            : methodChoice
              ? "You can continue."
              : "You're all set."}
        </p>
        {allowAddMore && (
          <button
            type="button"
            onClick={addAnother}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
          >
            <IconGradCap className="h-4 w-4" /> Verify another student
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={box}>
      {/* In the wizard's method-chooser view the step title already frames the
          screen, and every extra line was called out as clutter (Aug 18
          walkthrough: "only have these two boxes") — so the panel heading and
          instruction line render only outside that view. */}
      {!(methodChoice && step === "method") && (
        <>
          <div className="flex items-center gap-2">
            <IconGradCap className="h-5 w-5 text-amber-300" />
            <h3 className="font-semibold text-white">
              {hasNames
                ? `Verify via ${nameList}`
                : selfVerify
                  ? "Verify your OHS email"
                  : "Verify your OHS student"}
            </h3>
          </div>
          <p className="mt-1.5 text-sm text-white/65">
            {hasNames ? (
              <>Have {nameList} check their Stanford email and enter the code below.</>
            ) : selfVerify ? (
              <>We&apos;ll email a 6-digit code to your OHS Stanford address.</>
            ) : (
              <>We&apos;ll email a 6-digit code to your child&apos;s OHS Stanford address.</>
            )}
          </p>
        </>
      )}

      {step === "method" && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setStep("email")}
            className="rounded-xl border border-amber-400/40 bg-black/30 p-3 text-left transition hover:border-amber-400/70"
          >
            <span className="block text-sm font-semibold text-white">Email a code</span>
            <span className="mt-0.5 block text-xs text-white/55">
              {selfVerify
                ? "We'll send a 6-digit code to your OHS email."
                : "We'll send a 6-digit code to your child's OHS email."}
            </span>
          </button>
          {WHATSAPP_URL && (
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="rounded-xl border border-white/15 bg-black/30 p-3 text-left transition hover:border-white/35"
            >
              <span className="block text-sm font-semibold text-white">
                Message Daniel on WhatsApp
              </span>
              <span className="mt-0.5 block text-xs text-white/55">
                Manual approval — you can keep going, but your dashboard stays
                locked until he approves your family.
              </span>
            </button>
          )}
        </div>
      )}

      {step === "manual" && WHATSAPP_URL && (
        <div className="mt-4 flex flex-col gap-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Open WhatsApp →
          </a>
          <p className="text-sm text-white/65">
            Send Daniel a message and he&apos;ll approve your family manually. You
            can continue setting up now — until he does, you&apos;re{" "}
            <strong>unverified</strong> and your dashboard stays locked.
          </p>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="self-start text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
          >
            Use the email code instead
          </button>
        </div>
      )}

      {step === "email" && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !pending && sendCode()}
            placeholder="name@ohs.stanford.edu"
            className="flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={pending || !email.trim()}
            className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send code"}
          </button>
        </div>
      )}

      {step === "code" && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && !pending && code.length === 6 && verify()}
              placeholder="123456"
              className="flex-1 rounded-lg border border-white/15 bg-black/50 px-3 py-2 font-mono text-lg tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/30 focus:border-amber-400/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={verify}
              disabled={pending || code.length !== 6}
              className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
            >
              {pending ? "Checking…" : "Verify"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              disabled={pending}
              className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
            >
              Use a different email
            </button>
            {/* Didn't arrive? Resend, gated by the 15s countdown. */}
            {cooldown > 0 ? (
              <span className="text-xs text-white/45">
                Didn&apos;t get it? Check spam — you can resend in {cooldown}s.
              </span>
            ) : (
              <button
                type="button"
                onClick={sendCode}
                disabled={pending || !email.trim()}
                className="text-xs font-medium text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-200 disabled:opacity-50"
              >
                {pending ? "Resending…" : "Resend code"}
              </button>
            )}
          </div>
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-emerald-300/90">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {/* Not tiny footnote text (Aug 17 walkthrough): the alternative has to be
          findable and OBVIOUSLY a link. */}
      {WHATSAPP_URL && step !== "method" && step !== "manual" && (
        <p className="mt-4 border-t border-white/10 pt-3 text-sm text-white/60">
          {selfVerify
            ? "Can't get to your Stanford inbox right now?"
            : "Don't have your student's Stanford email handy?"}{" "}
          {methodChoice ? (
            // In the wizard, switching method must go through the manual STEP —
            // that's what tells the gate the member may advance as unverified.
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="font-medium text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-200"
            >
              Message Daniel on WhatsApp
            </button>
          ) : (
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-300 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-200"
            >
              Message Daniel on WhatsApp
            </a>
          )}{" "}
          to get verified another way.
        </p>
      )}
    </div>
  );
}
