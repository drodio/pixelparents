import { currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { pickEstimateCents } from "./estimate-tuner";
import { isApprovedAdmin } from "@/lib/admin-access";

// Comma-separated email allowlist read from env at request time.
// e.g. ADMIN_EMAILS="drodio@storytell.ai,co-founder@example.com"
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Only VERIFIED emails count. An unverified email is just a string the user
// typed — trusting it would let anyone claim admin by adding an admin address
// to their own account without proving control of it. Shared by isAdmin() and
// adminGate() so the two can never diverge on this check.
function verifiedEmails(
  user: Awaited<ReturnType<typeof currentUser>>,
): string[] {
  return (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
}

// Super admins are hardcoded — changing this set requires a code change + PR
// (deliberately NOT env, since env can change without review). Super admins
// bypass every grant/scope check and are the only tier (Phase 1) that sees
// /admin/access (and, in Phase 2, /admin/roles).
export const SUPER_ADMIN_EMAILS = [
  "drodio@chief.bot",
  "drodio@gmail.com",
  "drodio@storytell.ai",
];
function superAdminEmails(): string[] {
  return SUPER_ADMIN_EMAILS.map((s) => s.toLowerCase());
}

export async function isSuperAdmin(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  if (!user) return false;
  return verifiedEmails(user).some((e) => superAdminEmails().includes(e));
}

export async function isAdmin(): Promise<boolean> {
  const user = await currentUser().catch(() => null);
  if (!user) return false;
  const verified = verifiedEmails(user);
  // 1) super admin (hardcoded) 2) bootstrap env allowlist 3) DB-approved row.
  if (verified.some((e) => superAdminEmails().includes(e))) return true;
  const allow = adminEmails();
  if (allow.length > 0 && verified.some((e) => allow.includes(e))) return true;
  return isApprovedAdmin(user.id);
}

// Throws a Response-shaped error the route can convert into a 403.
// Use in API routes. Pages should use adminGate() so a non-admin sees a
// friendly <NotAuthorized/> page instead of Next's raw error overlay.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
}

// Page-friendly gate: one currentUser() call, returns the signed-in viewer's
// email on the not-ok path so <NotAuthorized email={...}/> can name the
// account. Pattern: `const gate = await adminGate(); if (!gate.ok) return
// <NotAuthorized email={gate.email} />;`
export async function adminGate(): Promise<
  { ok: true } | { ok: false; email: string | null }
> {
  const user = await currentUser().catch(() => null);
  if (user) {
    const verified = verifiedEmails(user);
    const allow = adminEmails();
    const ok =
      verified.some((e) => superAdminEmails().includes(e)) ||
      (allow.length > 0 && verified.some((e) => allow.includes(e))) ||
      (await isApprovedAdmin(user.id));
    if (ok) return { ok: true };
  }
  return {
    ok: false,
    email:
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      null,
  };
}

// Fallback per-eval cost estimates in cents, used only until we have enough
// real actuals to tune against (see getEstimateCents). Numbers assume Anthropic
// prompt caching is enabled for the rubric.
export const COST_PER_EVAL_CENTS: Record<ScoringModel, number> = {
  opus: 35,
  sonnet: 13,
};

// Auto-tuner window: median of the last N evals per model, requiring at least
// MIN samples before we trust actuals over the flat fallback above.
const ESTIMATE_SAMPLE_SIZE = 20;
const ESTIMATE_MIN_SAMPLES = 5;

export type ScoringModel = "opus" | "sonnet";

export function isScoringModel(s: string): s is ScoringModel {
  return s === "opus" || s === "sonnet";
}

// AI Gateway model strings.
export const MODEL_GATEWAY_ID: Record<ScoringModel, string> = {
  opus: "anthropic/claude-opus-4-7",
  sonnet: "anthropic/claude-sonnet-4-6",
};

// Tuned per-eval estimate in cents for one model: the median real total cost
// (Claude + Exa) of the most recent evals, falling back to the flat constant
// until enough samples exist. The model lives in the pricing JSONB
// (pricing.llm.model), since evaluations has no model column.
export async function getEstimateCents(model: ScoringModel): Promise<number> {
  const rows = await db
    .select({ cents: evaluations.costTotalCents })
    .from(evaluations)
    .where(
      sql`${evaluations.pricing} -> 'llm' ->> 'model' = ${model} and ${evaluations.costTotalCents} is not null`,
    )
    .orderBy(sql`${evaluations.createdAt} desc`)
    .limit(ESTIMATE_SAMPLE_SIZE);
  const samples = rows
    .map((r) => r.cents)
    .filter((c): c is number => c != null);
  return pickEstimateCents(samples, COST_PER_EVAL_CENTS[model], ESTIMATE_MIN_SAMPLES);
}

export async function estimateJobCents(itemCount: number, model: ScoringModel): Promise<number> {
  return itemCount * (await getEstimateCents(model));
}

// Approximate cost per Exa-backed handle-resolution call (find-handle), used as
// the client-side preview fallback. The bulk cron now bills the real resolution
// cost (see scoring-tick); this constant is only a forward estimate.
export const HANDLE_RESOLVE_CENTS = 4;
