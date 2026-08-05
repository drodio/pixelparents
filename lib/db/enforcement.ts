import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { enforcementActions, type EnforcementActionRow } from "@/lib/db/schema/enforcement";
import { signups } from "@/lib/db/schema/signups";
import {
  activeRestriction,
  summarizeHistory,
  expiryFromHours,
  coerceKind,
  type Restriction,
} from "@/lib/enforcement";
import { logEvent } from "@/lib/db/app-logs";

// Self-healing DDL (no migrate-on-deploy in this repo).
let ensured: Promise<void> | null = null;

export function ensureEnforcementTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const db = getSql();
      await db.transaction([
        db`
          CREATE TABLE IF NOT EXISTS enforcement_actions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            signup_id uuid NOT NULL,
            subject_email text,
            kind text NOT NULL,
            expires_at timestamptz,
            reason text NOT NULL,
            target_type text,
            target_id text,
            admin_email text NOT NULL,
            revoked_at timestamptz,
            revoked_by_email text
          )
        `,
        db`CREATE INDEX IF NOT EXISTS enforcement_signup_idx ON enforcement_actions (signup_id)`,
        db`CREATE INDEX IF NOT EXISTS enforcement_kind_idx ON enforcement_actions (kind)`,
        db`CREATE INDEX IF NOT EXISTS enforcement_created_idx ON enforcement_actions (created_at DESC)`,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export async function recordEnforcement(input: {
  signupId: string;
  kind: string;
  reason: string;
  adminEmail: string;
  durationHours?: number | null;
  targetType?: string | null;
  targetId?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  await ensureEnforcementTable();
  const kind = coerceKind(input.kind);
  if (!kind) return { ok: false, message: "Unknown action." };
  // A restriction with no stated reason is indefensible if it's ever challenged.
  if (!input.reason.trim()) return { ok: false, message: "A reason is required." };

  const [subject] = await getDb()
    .select({ email: signups.email })
    .from(signups)
    .where(eq(signups.id, input.signupId))
    .limit(1);

  await getDb()
    .insert(enforcementActions)
    .values({
      signupId: input.signupId,
      subjectEmail: subject?.email ?? null,
      kind,
      // delete/note carry no duration.
      expiresAt:
        kind === "mute" || kind === "ban"
          ? expiryFromHours(input.durationHours ?? null)
          : null,
      reason: input.reason.trim().slice(0, 2000),
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      adminEmail: input.adminEmail,
    });

  // Mirrored into the audit log so admin activity is queryable alongside
  // everything else, and so a deleted enforcement row still leaves a trace.
  void logEvent({
    level: "warn",
    event: `admin.enforcement.${kind}`,
    message: `Admin applied ${kind}`,
    actorEmail: input.adminEmail,
    context: {
      subjectSignupId: input.signupId,
      subjectEmail: subject?.email ?? null,
      reason: input.reason,
      durationHours: input.durationHours ?? null,
      permanent: (input.durationHours ?? null) === null && (kind === "mute" || kind === "ban"),
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
    },
  });

  return { ok: true, message: `${kind} recorded.` };
}

export async function revokeEnforcement(
  actionId: string,
  adminEmail: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureEnforcementTable();
  const res = await getDb()
    .update(enforcementActions)
    .set({ revokedAt: new Date(), revokedByEmail: adminEmail })
    .where(and(eq(enforcementActions.id, actionId), eq(enforcementActions.revokedAt, null as never)))
    .returning({ id: enforcementActions.id, signupId: enforcementActions.signupId });

  if (res.length === 0) {
    // Fall back to an unconditional update — the NULL comparison above is
    // strict, and a already-revoked row should report clearly rather than error.
    const [row] = await getDb()
      .select({ revokedAt: enforcementActions.revokedAt })
      .from(enforcementActions)
      .where(eq(enforcementActions.id, actionId))
      .limit(1);
    if (row?.revokedAt) return { ok: false, message: "That action was already lifted." };
    await getDb()
      .update(enforcementActions)
      .set({ revokedAt: new Date(), revokedByEmail: adminEmail })
      .where(eq(enforcementActions.id, actionId));
  }

  void logEvent({
    level: "warn",
    event: "admin.enforcement.revoked",
    message: "Admin lifted an enforcement action",
    actorEmail: adminEmail,
    context: { actionId },
  });
  return { ok: true, message: "Lifted." };
}

export async function listEnforcementFor(signupId: string): Promise<EnforcementActionRow[]> {
  await ensureEnforcementTable();
  return getDb()
    .select()
    .from(enforcementActions)
    .where(eq(enforcementActions.signupId, signupId))
    .orderBy(desc(enforcementActions.createdAt));
}

export async function listAllEnforcement(limit = 200): Promise<EnforcementActionRow[]> {
  await ensureEnforcementTable();
  return getDb()
    .select()
    .from(enforcementActions)
    .orderBy(desc(enforcementActions.createdAt))
    .limit(limit);
}

// One-shot history summary for every listed member, so the admin table can show
// an "Enforcement" column without an N+1 query per row.
export async function enforcementSummaries(
  signupIds: string[],
): Promise<Map<string, { summary: string; restriction: Restriction }>> {
  const out = new Map<string, { summary: string; restriction: Restriction }>();
  if (signupIds.length === 0) return out;
  await ensureEnforcementTable();
  const rows = await getDb()
    .select()
    .from(enforcementActions)
    .where(inArray(enforcementActions.signupId, signupIds));

  const bySignup = new Map<string, EnforcementActionRow[]>();
  for (const r of rows) {
    const list = bySignup.get(r.signupId) ?? [];
    list.push(r);
    bySignup.set(r.signupId, list);
  }
  for (const id of signupIds) {
    const list = bySignup.get(id) ?? [];
    out.set(id, {
      summary: summarizeHistory(list),
      restriction: activeRestriction(list),
    });
  }
  return out;
}

// The gate every write path consults: is this member allowed to post right now?
export async function restrictionFor(signupId: string): Promise<Restriction> {
  await ensureEnforcementTable();
  const rows = await getDb()
    .select()
    .from(enforcementActions)
    .where(eq(enforcementActions.signupId, signupId));
  return activeRestriction(rows);
}
