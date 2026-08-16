import { and, eq, ne, or, sql } from "drizzle-orm";
import { getDb, getSql } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { familyLinkRequests, type FamilyLinkRequestRow } from "@/lib/db/schema/family-links";
import { isStudentAccount } from "@/lib/family-display";
import {
  canRequestLink,
  canDecideLink,
  canCreateAnotherRequest,
  membersMovedByLink,
  type LinkCheck,
} from "@/lib/family-links";
import { displayName } from "@/lib/family-links";
import { logEvent } from "@/lib/db/app-logs";
import { notifyFamilyLinkRequest } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";
import { after } from "next/server";

// Self-healing DDL — this repo has no migrate-on-deploy, so a new table must
// create itself on first use or the feature is dead until someone migrates.
let ensured: Promise<void> | null = null;

export function ensureFamilyLinksTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const db = getSql();
      await db.transaction([
        db`
          CREATE TABLE IF NOT EXISTS family_link_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            from_signup_id uuid NOT NULL,
            from_family_id uuid NOT NULL,
            to_email text NOT NULL,
            to_signup_id uuid,
            status text NOT NULL DEFAULT 'pending',
            decided_at timestamptz,
            decided_by_signup_id uuid
          )
        `,
        db`CREATE INDEX IF NOT EXISTS family_link_to_email_idx ON family_link_requests (to_email)`,
        db`CREATE INDEX IF NOT EXISTS family_link_from_idx ON family_link_requests (from_signup_id)`,
        db`CREATE INDEX IF NOT EXISTS family_link_status_idx ON family_link_requests (status)`,
      ]);
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

type Row = { id: string; familyId: string; email: string; firstName: string | null; extra: unknown };

async function findByEmail(email: string): Promise<Row | null> {
  const [row] = await getDb()
    .select({
      id: signups.id,
      familyId: signups.familyId,
      email: signups.email,
      firstName: signups.firstName,
      extra: signups.extra,
    })
    .from(signups)
    .where(sql`lower(${signups.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return (row as Row) ?? null;
}

async function findById(id: string): Promise<Row | null> {
  const [row] = await getDb()
    .select({
      id: signups.id,
      familyId: signups.familyId,
      email: signups.email,
      firstName: signups.firstName,
      extra: signups.extra,
    })
    .from(signups)
    .where(eq(signups.id, id))
    .limit(1);
  return (row as Row) ?? null;
}

// Ask to join the family that owns `targetEmail`.
//
// Returns ok:true for BOTH "request created" and "no such account", with the
// same message, so this can't be used to enumerate which OHS families have
// accounts. See linkNotFoundMessage().
export async function createFamilyLinkRequest(
  fromSignupId: string,
  targetEmail: string,
): Promise<{ ok: boolean; message: string; created?: boolean }> {
  await ensureFamilyLinksTable();
  const me = await findById(fromSignupId);
  if (!me) return { ok: false, message: "We couldn't find your account." };

  const pending = await getDb()
    .select({ id: familyLinkRequests.id })
    .from(familyLinkRequests)
    .where(
      and(eq(familyLinkRequests.fromSignupId, fromSignupId), eq(familyLinkRequests.status, "pending")),
    );
  const cap: LinkCheck = canCreateAnotherRequest(pending.length);
  if (!cap.ok) return { ok: false, message: cap.reason };

  const target = await findByEmail(targetEmail);
  const check = canRequestLink(
    { signupId: me.id, familyId: me.familyId, email: me.email },
    {
      email: targetEmail,
      signupId: target?.id ?? null,
      familyId: target?.familyId ?? null,
    },
  );

  const neutral =
    "If that email has a GoPixel account, we've sent them a request to approve. If they don't have one yet, invite them instead.";

  if (!check.ok) {
    // NOT_FOUND is answered with the same neutral message as success.
    if (check.reason === "NOT_FOUND") {
      void logEvent({
        event: "family.link.requested_unknown",
        message: "Link requested to an email with no account",
        actorSignupId: fromSignupId,
      });
      return { ok: true, message: neutral, created: false };
    }
    return { ok: false, message: check.reason };
  }

  // Don't stack duplicates at the same target.
  const dupe = await getDb()
    .select({ id: familyLinkRequests.id })
    .from(familyLinkRequests)
    .where(
      and(
        eq(familyLinkRequests.fromSignupId, fromSignupId),
        eq(familyLinkRequests.status, "pending"),
        sql`lower(${familyLinkRequests.toEmail}) = ${targetEmail.trim().toLowerCase()}`,
      ),
    )
    .limit(1);
  if (dupe.length > 0) {
    return { ok: true, message: "You already have a pending request to that person.", created: false };
  }

  await getDb().insert(familyLinkRequests).values({
    fromSignupId: me.id,
    fromFamilyId: me.familyId,
    toEmail: targetEmail.trim().toLowerCase(),
    toSignupId: target!.id,
  });

  void logEvent({
    event: "family.link.requested",
    message: "Family link request created",
    actorSignupId: fromSignupId,
    context: { toSignupId: target!.id },
  });

  // Tell them by email too. Without this the request only ever shows in-app, so
  // a parent who doesn't visit never learns a student is blocked on them.
  // after() so a slow/failing mail provider can't delay or fail the request.
  // Full name, not just the first: the recipient is deciding whether to merge
  // families with this person and needs to know which one they are.
  const meName = displayName(me) ?? "";
  const meIsStudent = isStudentAccount({ extra: me.extra as Record<string, unknown> | null });
  const toEmail = target!.email;
  after(async () => {
    try {
      await notifyFamilyLinkRequest({
        to: toEmail,
        fromName: meName,
        fromIsStudent: meIsStudent,
        familyUrl: `${getBaseUrl()}/family`,
      });
    } catch (err) {
      void logEvent({
        level: "warn",
        event: "family.link.email_failed",
        message: "Link-request email failed (request itself is unaffected)",
        error: err,
      });
    }
  });

  return { ok: true, message: neutral, created: true };
}

export type IncomingRequest = FamilyLinkRequestRow & {
  fromName: string | null;
  fromIsStudent: boolean;
  movingCount: number;
  movingNames: string[];
  movingHasOtherAdults: boolean;
};

// Requests awaiting THIS family's decision.
export async function listIncomingLinkRequests(
  viewerSignupId: string,
): Promise<IncomingRequest[]> {
  await ensureFamilyLinksTable();
  const me = await findById(viewerSignupId);
  if (!me) return [];

  const rows = await getDb()
    .select()
    .from(familyLinkRequests)
    .where(
      and(
        eq(familyLinkRequests.status, "pending"),
        or(
          sql`lower(${familyLinkRequests.toEmail}) = ${me.email.trim().toLowerCase()}`,
          eq(familyLinkRequests.toSignupId, me.id),
        )!,
      ),
    );

  const out: IncomingRequest[] = [];
  for (const r of rows) {
    // Everyone who would move, so the approver sees exactly what they're accepting.
    const members = await getDb()
      .select({
        id: signups.id,
        firstName: signups.firstName,
        lastName: signups.lastName,
        extra: signups.extra,
      })
      .from(signups)
      .where(eq(signups.familyId, r.fromFamilyId));
    const moved = membersMovedByLink(
      members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        isStudent: isStudentAccount({ extra: m.extra as Record<string, unknown> | null }),
      })),
    );
    const from = members.find((m) => m.id === r.fromSignupId);
    out.push({
      ...r,
      fromName: displayName(from),
      fromIsStudent: from
        ? isStudentAccount({ extra: from.extra as Record<string, unknown> | null })
        : false,
      movingCount: moved.count,
      movingNames: moved.names,
      movingHasOtherAdults: moved.hasOtherAdults,
    });
  }
  return out;
}

// Requests this family has sent that are still waiting.
export async function listOutgoingLinkRequests(
  viewerSignupId: string,
): Promise<FamilyLinkRequestRow[]> {
  await ensureFamilyLinksTable();
  return getDb()
    .select()
    .from(familyLinkRequests)
    .where(
      and(
        eq(familyLinkRequests.fromSignupId, viewerSignupId),
        eq(familyLinkRequests.status, "pending"),
      ),
    );
}

// Approve: move the requester's ENTIRE family (members + their children) into
// the decider's family, then mark the request approved.
//
// Whole-family, not just the requester, so we never strand a co-parent or a
// child in an orphaned family. The approval UI names everyone who moves.
export async function approveFamilyLinkRequest(
  requestId: string,
  deciderSignupId: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureFamilyLinksTable();
  const [req] = await getDb()
    .select()
    .from(familyLinkRequests)
    .where(eq(familyLinkRequests.id, requestId))
    .limit(1);
  if (!req) return { ok: false, message: "That request no longer exists." };

  const decider = await findById(deciderSignupId);
  if (!decider) return { ok: false, message: "We couldn't find your account." };

  const check = canDecideLink(
    { toSignupId: req.toSignupId, toEmail: req.toEmail, status: req.status },
    { signupId: decider.id, email: decider.email, familyId: decider.familyId },
    decider.familyId,
  );
  if (!check.ok) return { ok: false, message: check.reason };

  if (req.fromFamilyId === decider.familyId) {
    return { ok: false, message: "You're already in the same family." };
  }

  try {
    const db = getSql();
    // One transaction: repoint members + children, then close the request. The
    // old family row is left behind (harmless, and keeps invite tokens valid).
    await db.transaction([
      db`UPDATE signups SET family_id = ${decider.familyId} WHERE family_id = ${req.fromFamilyId}`,
      db`UPDATE children SET family_id = ${decider.familyId} WHERE family_id = ${req.fromFamilyId}`,
      db`UPDATE family_link_requests
           SET status = 'approved', decided_at = now(), decided_by_signup_id = ${decider.id}
         WHERE id = ${requestId}`,
      // Any other pending request from that same family is now moot.
      db`UPDATE family_link_requests
           SET status = 'cancelled', decided_at = now()
         WHERE from_family_id = ${req.fromFamilyId} AND status = 'pending' AND id <> ${requestId}`,
    ]);

    void logEvent({
      event: "family.link.approved",
      message: "Family link approved — families merged",
      actorSignupId: deciderSignupId,
      context: { requestId, fromFamilyId: req.fromFamilyId, intoFamilyId: decider.familyId },
    });
    return { ok: true, message: "Linked. You're now one family." };
  } catch (err) {
    console.error("approveFamilyLinkRequest failed:", err);
    void logEvent({
      level: "error",
      event: "family.link.approve_failed",
      message: "Family link approval threw",
      actorSignupId: deciderSignupId,
      error: err,
      context: { requestId },
    });
    return { ok: false, message: "We couldn't complete that link. Please try again." };
  }
}

export async function declineFamilyLinkRequest(
  requestId: string,
  deciderSignupId: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureFamilyLinksTable();
  const [req] = await getDb()
    .select()
    .from(familyLinkRequests)
    .where(eq(familyLinkRequests.id, requestId))
    .limit(1);
  if (!req) return { ok: false, message: "That request no longer exists." };

  const decider = await findById(deciderSignupId);
  if (!decider) return { ok: false, message: "We couldn't find your account." };

  const check = canDecideLink(
    { toSignupId: req.toSignupId, toEmail: req.toEmail, status: req.status },
    { signupId: decider.id, email: decider.email, familyId: decider.familyId },
    decider.familyId,
  );
  if (!check.ok) return { ok: false, message: check.reason };

  await getDb()
    .update(familyLinkRequests)
    .set({ status: "declined", decidedAt: new Date(), decidedBySignupId: decider.id })
    .where(eq(familyLinkRequests.id, requestId));

  void logEvent({
    event: "family.link.declined",
    actorSignupId: deciderSignupId,
    context: { requestId },
  });
  return { ok: true, message: "Request declined." };
}

// The requester withdrawing their own ask.
export async function cancelFamilyLinkRequest(
  requestId: string,
  fromSignupId: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureFamilyLinksTable();
  const res = await getDb()
    .update(familyLinkRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(
      and(
        eq(familyLinkRequests.id, requestId),
        eq(familyLinkRequests.fromSignupId, fromSignupId),
        eq(familyLinkRequests.status, "pending"),
      ),
    )
    .returning({ id: familyLinkRequests.id });
  return res.length > 0
    ? { ok: true, message: "Request withdrawn." }
    : { ok: false, message: "That request is no longer pending." };
}

// Does this student already have a linked parent (so the invite step can be
// skipped)? Mirrors getStudentParentLinkStatus's definition of "parent".
export async function familyHasOtherAdult(signupId: string): Promise<boolean> {
  const me = await findById(signupId);
  if (!me) return false;
  const others = await getDb()
    .select({ extra: signups.extra })
    .from(signups)
    .where(and(eq(signups.familyId, me.familyId), ne(signups.id, signupId)));
  return others.some(
    (o) => !isStudentAccount({ extra: o.extra as Record<string, unknown> | null }),
  );
}
