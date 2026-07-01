"use server";

import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { ensureFamiliesSchema } from "@/lib/db/ensure";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { mergeFamiliesByVerifiedEmail } from "@/lib/family-merge";
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
  verifiedEmailsOf,
  type PendingVerify,
} from "@/lib/verify";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifyState = {
  status: ApprovalStatus;
  // The verified student email (when approved) or the pending one (when a code
  // is outstanding); null otherwise. Never the code itself.
  email: string | null;
  // All OHS students this family has verified (lowercased, deduped). A family can
  // verify many students; `email` stays the most-recent/legacy singular value for
  // back-compat. Empty until at least one student is verified.
  verifiedEmails: string[];
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
    verifiedEmails: [],
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
      verifiedEmails: verifiedEmailsOf(extra),
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
    // A family may verify many students. If this exact email is already verified
    // there's nothing to do — but we must NOT return ok:true here: the widget only
    // checks r.ok and would advance to the code step showing "We sent a 6-digit
    // code" when no code was sent, leaving the family waiting on a code that never
    // arrives. Return a clear message via the error path so the widget stays put
    // and tells them it's already done. (An already-approved family can still send
    // a code for a NEW, not-yet-verified student — we only stop on an exact
    // re-verify of an email already on file.)
    if (verifiedEmailsOf(extra).includes(email)) {
      return {
        ok: false,
        error: "This student is already verified — no code needed.",
      };
    }

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
// the signups (extra.verifiedStudentEmail + extra.verifiedStudentEmails) and on
// the family's children. A family may verify many students; each successful
// confirm appends to the deduped verifiedStudentEmails array while keeping the
// legacy singular field in lockstep.
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
    const pending = pendingOf(extra);
    // Already approved AND nothing in flight: terminal state, nothing to confirm.
    // If a code IS outstanding we still process it — an approved family verifying
    // an ADDITIONAL student needs the new email recorded (additive, not re-gating).
    if (!pending && readApprovalStatus(extra) === "approved") {
      return { ok: true, status: "approved" };
    }

    const now = Date.now();
    const result = checkCode(pending, code, now);

    if (result === "ok" && pending) {
      const at = new Date(now).toISOString();
      const email = pending.email;
      await ensureFamiliesSchema();
      const sql = getSql();
      // Approve every parent in the family. Treat a verified student email as an
      // approval; never resurrect a row an admin explicitly denied. Drop the
      // now-spent pending code. A family can verify many students, so we ALSO
      // append the email to the deduped `verifiedStudentEmails` array (jsonb)
      // while keeping the legacy singular `verifiedStudentEmail` in lockstep.
      // Approval attribution (approvalBy/approvalAt) is only stamped on rows not
      // yet approved, so confirming a 2nd student doesn't rewrite the 1st's
      // approval metadata — this is purely additive, never re-gating.
      await sql`
        UPDATE signups
        SET extra = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
              COALESCE(extra, '{}'::jsonb) - 'studentVerify',
              '{approvalStatus}', to_jsonb('approved'::text), true),
              '{approvalBy}',
                CASE WHEN COALESCE(extra->>'approvalStatus', 'pending') = 'approved'
                  THEN COALESCE(extra->'approvalBy', to_jsonb('student-email'::text))
                  ELSE to_jsonb('student-email'::text) END,
                true),
              '{approvalAt}',
                CASE WHEN COALESCE(extra->>'approvalStatus', 'pending') = 'approved'
                  THEN COALESCE(extra->'approvalAt', to_jsonb(${at}::text))
                  ELSE to_jsonb(${at}::text) END,
                true),
              '{verifiedStudentEmail}', to_jsonb(${email}::text), true),
              '{verifiedStudentEmails}',
                CASE
                  -- Already present (in the array, or as a legacy singular that
                  -- the array would inherit): leave the list untouched.
                  WHEN COALESCE(
                         extra->'verifiedStudentEmails',
                         CASE WHEN jsonb_typeof(extra->'verifiedStudentEmail') = 'string'
                           THEN jsonb_build_array(extra->'verifiedStudentEmail')
                           ELSE '[]'::jsonb END
                       ) @> to_jsonb(${email}::text)
                    THEN COALESCE(
                         extra->'verifiedStudentEmails',
                         CASE WHEN jsonb_typeof(extra->'verifiedStudentEmail') = 'string'
                           THEN jsonb_build_array(extra->'verifiedStudentEmail')
                           ELSE '[]'::jsonb END)
                  -- Otherwise append to the (back-filled) base array.
                  ELSE COALESCE(
                         extra->'verifiedStudentEmails',
                         CASE WHEN jsonb_typeof(extra->'verifiedStudentEmail') = 'string'
                           THEN jsonb_build_array(extra->'verifiedStudentEmail')
                           ELSE '[]'::jsonb END
                       ) || to_jsonb(${email}::text)
                END,
                true)
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
      // Auto-link by shared OHS email: if ANOTHER family already carries this
      // student email, merge them into the oldest family. Flagged OFF by default
      // (FAMILY_AUTOLINK_ENABLED) so merging this branch changes nothing until
      // the flag is set. Runs AFTER the approve/append/children UPDATEs above and
      // is best-effort: a merge failure never blocks the primary approval the
      // parent just completed. See lib/family-merge.ts.
      if (process.env.FAMILY_AUTOLINK_ENABLED === "true") {
        try {
          await mergeFamiliesByVerifiedEmail(row.familyId, email);
        } catch (err) {
          console.error("mergeFamiliesByVerifiedEmail failed:", err);
        }
      }
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
