import { createHash, randomInt } from "node:crypto";

// Student-email verification (the self-serve "this is a real OHS family" check):
// a parent enters their OHS student's Stanford email, we mail a short code, and
// confirming it marks the family approved. Pure helpers here so the rules are
// unit-testable; the DB/email wiring lives in lib/email.ts + the signup actions.

// OHS students have stanford.edu addresses (e.g. @ohs.stanford.edu). Accept the
// apex domain and any subdomain of it.
export function isStudentEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const domain = e.split("@")[1] ?? "";
  return domain === "stanford.edu" || domain.endsWith(".stanford.edu");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// 6-digit numeric code (cryptographically random, leading zeros preserved).
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// We store only the hash of the code, never the code itself.
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export const CODE_TTL_MS = 10 * 60 * 1000; // codes expire after 10 minutes
export const MAX_ATTEMPTS = 5; // wrong-code guesses before the code is burned
export const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between sends

// Shape persisted in signups.extra.studentVerify while a code is outstanding.
export type PendingVerify = {
  email: string;
  codeHash: string;
  expiresAt: number; // epoch ms
  attempts: number;
  lastSentAt: number; // epoch ms
};

// A family can verify many OHS students. We keep the original singular
// `verifiedStudentEmail` in lockstep for back-compat AND maintain a
// `verifiedStudentEmails` array (lowercased, deduped). This reader tolerates a
// row that only carries the legacy singular field by falling back to it, so older
// families verified before this feature still list their one student.
export function verifiedEmailsOf(extra: Record<string, unknown>): string[] {
  const list = extra.verifiedStudentEmails;
  if (Array.isArray(list)) {
    return list.filter((e): e is string => typeof e === "string" && e.length > 0);
  }
  const single = extra.verifiedStudentEmail;
  return typeof single === "string" && single ? [single] : [];
}

export type VerifyCheck = "ok" | "no-code" | "expired" | "too-many-attempts" | "mismatch";

// Pure decision for a submitted code against the stored pending state.
export function checkCode(pending: PendingVerify | null | undefined, code: string, now: number): VerifyCheck {
  if (!pending) return "no-code";
  if (now > pending.expiresAt) return "expired";
  if (pending.attempts >= MAX_ATTEMPTS) return "too-many-attempts";
  return hashCode(code) === pending.codeHash ? "ok" : "mismatch";
}
