"use client";

import { useState, useTransition } from "react";
import { requestStudentCode, confirmStudentCode, type VerifyState } from "@/app/signup/thanks/verify-actions";

type Step = "email" | "code" | "approved";

// Self-serve "this is a real OHS family" check: the parent enters their OHS
// student's stanford.edu email, we mail a 6-digit code, and confirming it marks
// the family verified (approved for the OHS directory). Drives lib/verify.ts via
// the requestStudentCode / confirmStudentCode server actions.
export function StudentVerify({
  signupId,
  initial,
  compact = false,
}: {
  signupId: string;
  initial: VerifyState;
  compact?: boolean;
}) {
  // Resume mid-flow: approved → done; an outstanding code → code step; else email.
  const [step, setStep] = useState<Step>(
    initial.status === "approved" ? "approved" : initial.hasPendingCode ? "code" : "email",
  );
  const [email, setEmail] = useState(initial.email ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initial.hasPendingCode && initial.email
      ? `We already sent a code to ${initial.email}. Enter it below, or use a different email.`
      : null,
  );
  const [pending, startTransition] = useTransition();

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
      setStep("approved");
      setNotice(null);
    });
  }

  const box = compact
    ? "rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5"
    : "rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5 sm:p-6";

  if (step === "approved") {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">✅</span>
          <h3 className="font-semibold text-white">Your OHS student is verified</h3>
        </div>
        <p className="mt-1.5 text-sm text-white/65">
          {initial.email
            ? `Verified with ${initial.email}. `
            : ""}
          Your family is approved for the OHS family directory.
        </p>
      </div>
    );
  }

  return (
    <div className={box}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg">🎓</span>
        <h3 className="font-semibold text-white">Verify your OHS student</h3>
      </div>
      <p className="mt-1.5 text-sm text-white/65">
        Every Pixel Parents family is paired with an OHS student. Enter your
        student&apos;s Stanford email and we&apos;ll send a code to confirm — this
        unlocks the OHS family directory for you.
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
    </div>
  );
}
