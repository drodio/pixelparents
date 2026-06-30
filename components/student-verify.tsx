"use client";

import { useState, useTransition } from "react";
import { requestStudentCode, confirmStudentCode, type VerifyState } from "@/app/signup/thanks/verify-actions";
import { IconCircleCheck, IconGradCap } from "@/components/icons";
import { formatNameList } from "@/lib/verify-copy";

// Optional WhatsApp fallback: a wa.me link (set NEXT_PUBLIC_DRODIO_WHATSAPP_URL
// in env — no phone number is committed to this public repo). Hidden when unset.
const WHATSAPP_URL = process.env.NEXT_PUBLIC_DRODIO_WHATSAPP_URL;

type Step = "email" | "code" | "approved";

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
}) {
  // Resume mid-flow: approved → done; an outstanding code → code step; else email.
  const [step, setStep] = useState<Step>(
    initial.status === "approved" ? "approved" : initial.hasPendingCode ? "code" : "email",
  );
  const [email, setEmail] = useState(initial.email ?? "");
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
            {/* Personalize the success line only for a single student — with
                several names "Maya or Ravi is verified" would wrongly imply all
                were verified in one go (the family verifies one at a time). */}
            {studentNames.length === 1
              ? `${studentNames[0]} is verified`
              : "Your OHS student is verified"}
          </h3>
        </div>
        <p className="mt-1.5 text-sm text-white/65">
          {verifiedEmail ? `Verified with ${verifiedEmail}. ` : ""}
          Your family is approved for the OHS family directory.
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
      <div className="flex items-center gap-2">
        <IconGradCap className="h-5 w-5 text-amber-300" />
        <h3 className="font-semibold text-white">
          {hasNames ? `Verify via ${nameList}` : "Verify your OHS student"}
        </h3>
      </div>
      <p className="mt-1.5 text-sm text-white/65">
        {hasNames ? (
          <>
            Have {nameList} check their Stanford email and enter the code.
            Pop in the stanford.edu address and we&apos;ll send a 6-digit code to
            confirm — this unlocks the OHS family directory for you.
          </>
        ) : (
          <>
            Every Pixel Parents family is paired with an OHS student. Enter your
            student&apos;s Stanford email and we&apos;ll send a code to confirm —
            this unlocks the OHS family directory for you.
          </>
        )}
      </p>

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
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            disabled={pending}
            className="self-start text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
          >
            Use a different email
          </button>
        </div>
      )}

      {notice && <p className="mt-3 text-sm text-emerald-300/90">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {WHATSAPP_URL && (
        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-white/45">
          Don&apos;t have your student&apos;s Stanford email handy?{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline-offset-2 hover:underline"
          >
            Message Daniel on WhatsApp
          </a>{" "}
          to get verified another way.
        </p>
      )}
    </div>
  );
}
