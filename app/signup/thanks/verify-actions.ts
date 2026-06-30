"use server";

import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { ensureFamiliesSchema } from "@/lib/db/ensure";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { sendStudentVerificationCode } from "@/lib/email";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  checkCode,
  generateCode,
  hashCode,
  isStudentEmail,
  normalizeEmail,
  type PendingVerify,
} from "@/lib/verify";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifyState = {
  status: ApprovalStatus;
  // The verified student email (when approved) or the pending one (when a code
  // is outstanding); null otherwise. Never the code itself.
  email: string | null;
  hasPendingCode: boolean;
  attemptsLeft: number;
};

function pendingOf(extra: Record<string, unknown>): PendingVerify | undefined {
  const p = extra.studentVerify;
  return p && typeof p === "object" ? (p as PendingVerify) : undefined;
}

// Snapshot the verification state for a signup — used to hydrate the widget and
// the /verify screen on load.
export async function getVerifyState(signupId: string): Promise<VerifyState> {
  const fallback: VerifyState = {
    status: "pending",
    email: null,
    hasPendingCode: false,
    attemptsLeft: MAX_ATTEMPTS,
  };
  if (!UUID_RE.test(signupId)) return fallback;
  try {
    const [row] = await getDb()
      .select({ extra: signups.extra })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return fallback;
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const status = readApprovalStatus(extra);
    const pending = pendingOf(extra);
    const verifiedEmail =
      typeof extra.verifiedStudentEmail === "string" ? extra.verifiedStudentEmail : null;
    return {
      status,
      email: status === "approved" ? verifiedEmail : (pending?.email ?? null),
      hasPendingCode: Boolean(pending),
      attemptsLeft: pending ? Math.max(0, MAX_ATTEMPTS - pending.attempts) : MAX_ATTEMPTS,
    };
  } catch (err) {
    console.error("getVerifyState failed:", err);
    return fallback;
  }
}

// Step 1: parent enters their OHS student's stanford.edu email; we generate a
// code, store its hash on the signup, and email the code to the student address.
export async function requestStudentCode(
  signupId: string,
  emailRaw: string,
): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  if (!UUID_RE.test(signupId)) return { ok: false, error: "Something went wrong — please reload." };
  const email = normalizeEmail(emailRaw || "");
  if (!isStudentEmail(email)) {
    return {
      ok: false,
      error: "Please enter a valid Stanford OHS student email (it must end in stanford.edu).",
    };
  }
  try {
    const [row] = await getDb()
      .select({ extra: signups.extra })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return { ok: false, error: "We couldn't find your signup — please reload the page." };
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    if (readApprovalStatus(extra) === "approved") return { ok: true, sentTo: email };

    const prev = pendingOf(extra);
    const now = Date.now();
    if (prev && now - prev.lastSentAt < RESEND_COOLDOWN_MS) {
      return { ok: false, error: "Please wait a few seconds before requesting another code." };
    }

    const code = generateCode();
    const pending: PendingVerify = {
      email,
      codeHash: hashCode(code),
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    };
    await getSql()`
      UPDATE signups
      SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{studentVerify}', ${JSON.stringify(pending)}::jsonb, true)
      WHERE id = ${signupId}
    `;

    const sent = await sendStudentVerificationCode({ to: email, code });
    if (!sent) {
      return {
        ok: false,
        error: "We couldn't send the email right now. Please try again in a moment.",
      };
    }
    return { ok: true, sentTo: email };
  } catch (err) {
    console.error("requestStudentCode failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

// Step 2: parent enters the emailed code. On success we approve the WHOLE family
// (every parent sharing the family_id) and record the verified email — both on
// the signups (extra.verifiedStudentEmail) and on the family's children.
export async function confirmStudentCode(
  signupId: string,
  codeRaw: string,
): Promise<{ ok: boolean; status?: ApprovalStatus; error?: string; attemptsLeft?: number }> {
  if (!UUID_RE.test(signupId)) return { ok: false, error: "Something went wrong — please reload." };
  const code = String(codeRaw || "").trim();
  try {
    const [row] = await getDb()
      .select({ extra: signups.extra, familyId: signups.familyId })
      .from(signups)
      .where(eq(signups.id, signupId))
      .limit(1);
    if (!row) return { ok: false, error: "We couldn't find your signup — please reload the page." };
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    if (readApprovalStatus(extra) === "approved") return { ok: true, status: "approved" };

    const pending = pendingOf(extra);
    const now = Date.now();
    const result = checkCode(pending, code, now);

    if (result === "ok" && pending) {
      const at = new Date(now).toISOString();
      const email = pending.email;
      await ensureFamiliesSchema();
      const sql = getSql();
      // Approve every parent in the family. Treat a verified student email as an
      // approval; never resurrect a row an admin explicitly denied. Drop the
      // now-spent pending code.
      await sql`
        UPDATE signups
        SET extra = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
              COALESCE(extra, '{}'::jsonb) - 'studentVerify',
              '{approvalStatus}', to_jsonb('approved'::text), true),
              '{approvalBy}', to_jsonb('student-email'::text), true),
              '{approvalAt}', to_jsonb(${at}::text), true),
              '{verifiedStudentEmail}', to_jsonb(${email}::text), true)
        WHERE family_id = ${row.familyId}
          AND COALESCE(extra->>'approvalStatus', 'pending') <> 'denied'
      `;
      // Stamp the verified student email onto the family's children that lack one.
      await sql`
        UPDATE children
        SET student_email = ${email}
        WHERE family_id = ${row.familyId}
          AND (student_email IS NULL OR student_email = '')
      `;
      return { ok: true, status: "approved" };
    }

    if (result === "mismatch" && pending) {
      const next: PendingVerify = { ...pending, attempts: pending.attempts + 1 };
      await getSql()`
        UPDATE signups
        SET extra = jsonb_set(COALESCE(extra, '{}'::jsonb), '{studentVerify}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${signupId}
      `;
      const left = Math.max(0, MAX_ATTEMPTS - next.attempts);
      return {
        ok: false,
        error:
          left > 0
            ? `That code didn't match. ${left} attempt${left === 1 ? "" : "s"} left.`
            : "Too many attempts. Please request a new code.",
        attemptsLeft: left,
      };
    }

    const error =
      result === "expired"
        ? "That code expired. Please request a new one."
        : result === "too-many-attempts"
          ? "Too many attempts. Please request a new code."
          : "Please request a verification code first.";
    return { ok: false, error, attemptsLeft: 0 };
  } catch (err) {
    console.error("confirmStudentCode failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
