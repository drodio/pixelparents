import { db } from "@/db";
import { users, apiKeys, evaluations, sentEmails } from "@/db/schema";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { SUPER_ADMIN_EMAILS } from "@/lib/admin";
import { canonicalProfileUrl } from "@/lib/canonical-profile-url";
import {
  firstNameFor,
  sendClaimWelcomeEmail,
  sendDevApiWelcomeEmail,
} from "@/lib/welcome-emails";

export type WelcomeKind = "claim_welcome" | "dev_api_welcome";

const CAP = 30; // max emails per pass per run — spreads backfill, respects Resend limits
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so";

// Never email these (operator + the email's own from/cc) — mark them sent so they
// drain from the backlog instead of being retried forever.
const NEVER_EMAIL = new Set(
  [...SUPER_ADMIN_EMAILS, "drodio@festival.so", "founder@festival.so"].map((e) => e.toLowerCase()),
);

export function welcomeEmailEnabled(kind: WelcomeKind): boolean {
  const raw =
    kind === "claim_welcome"
      ? process.env.CLAIM_WELCOME_EMAIL_ENABLED
      : process.env.DEV_API_WELCOME_EMAIL_ENABLED;
  const v = (raw ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

async function markSent(clerkUserId: string, kind: WelcomeKind): Promise<void> {
  await db.insert(sentEmails).values({ clerkUserId, kind }).onConflictDoNothing();
}

// Clerk id -> { email, firstName } for a batch (one Backend API call). Missing /
// failed ids are simply absent from the map.
async function resolveClerk(
  ids: string[],
): Promise<Map<string, { email: string | null; firstName: string | null }>> {
  const out = new Map<string, { email: string | null; firstName: string | null }>();
  if (ids.length === 0) return out;
  const clerk = await clerkClient();
  const res = await clerk.users.getUserList({ userId: ids, limit: ids.length });
  for (const u of res.data) {
    const email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null;
    out.set(u.id, { email, firstName: u.firstName ?? null });
  }
  return out;
}

// Backlog size for a kind (used to report counts before enabling).
export async function countUnsentClaim(): Promise<number> {
  const sent = db
    .select({ id: sentEmails.clerkUserId })
    .from(sentEmails)
    .where(eq(sentEmails.kind, "claim_welcome"));
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${users.clerkUserId})::int` })
    .from(users)
    .where(
      and(
        // Only owning (high-confidence) claims count as "claimed". A medium
        // (LinkedIn name-only) match links the user for display/dedup but is
        // NOT the owner — sending them a "you claimed your profile" email
        // contradicts the profile/leaderboard, which treat them as unclaimed.
        eq(users.matchConfidence, "high"),
        isNotNull(users.evaluationId),
        notInArray(users.clerkUserId, sent),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function countUnsentDevApi(): Promise<number> {
  const sent = db
    .select({ id: sentEmails.clerkUserId })
    .from(sentEmails)
    .where(eq(sentEmails.kind, "dev_api_welcome"));
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${apiKeys.clerkUserId})::int` })
    .from(apiKeys)
    .where(notInArray(apiKeys.clerkUserId, sent));
  return Number(row?.n ?? 0);
}

export async function runClaimWelcomePass(): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!welcomeEmailEnabled("claim_welcome")) return { sent: 0, skipped: 0, failed: 0 };
  const sent = db
    .select({ id: sentEmails.clerkUserId })
    .from(sentEmails)
    .where(eq(sentEmails.kind, "claim_welcome"));
  const rows = await db
    .select({
      clerkUserId: users.clerkUserId,
      evaluationId: users.evaluationId,
      fullName: evaluations.fullName,
      nickname: users.nickname,
    })
    .from(users)
    .leftJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(
      and(
        // High-confidence (owning) claims only — see countUnsentClaim.
        eq(users.matchConfidence, "high"),
        isNotNull(users.evaluationId),
        notInArray(users.clerkUserId, sent),
      ),
    )
    .orderBy(users.verifiedAt)
    .limit(CAP);
  if (rows.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  const ids = rows.map((r) => r.clerkUserId);
  const clerk = await resolveClerk(ids);
  // Variant: short if they ALSO have an API key. inArray (IN-list), not
  // sql`= any(array)` — the neon-http driver can't bind a JS array to ANY().
  const keyed = new Set(
    (
      await db
        .select({ id: apiKeys.clerkUserId })
        .from(apiKeys)
        .where(inArray(apiKeys.clerkUserId, ids))
    ).map((r) => r.id),
  );

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  for (const r of rows) {
    const info = clerk.get(r.clerkUserId);
    if (!info) continue; // Clerk miss this run -> retry next run (no mark)
    const email = info.email?.toLowerCase() ?? null;
    if (!email || NEVER_EMAIL.has(email)) {
      await markSent(r.clerkUserId, "claim_welcome");
      skipCount++;
      continue;
    }
    // Per-recipient isolation: a Resend (or Clerk/URL) failure for ONE user must
    // not abort the whole pass — otherwise everyone later in verifiedAt order is
    // wedged behind a single bad address until it's manually cleared. Log it and
    // leave the row unmarked so it retries on the next run.
    try {
      const path = r.evaluationId ? await canonicalProfileUrl(r.evaluationId) : null;
      const profileUrl = `${SITE}${path ?? `/profile?e=${r.evaluationId}`}`;
      await sendClaimWelcomeEmail({
        to: info.email!,
        firstName: firstNameFor(r.nickname, info.firstName, r.fullName),
        profileUrl,
        short: keyed.has(r.clerkUserId),
      });
      await markSent(r.clerkUserId, "claim_welcome");
      okCount++;
    } catch (err) {
      failCount++;
      console.error(
        `[welcome-sweep] claim_welcome send failed for ${r.clerkUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  if (okCount || failCount) {
    console.log(
      `[welcome-sweep] claim_welcome: sent=${okCount} skipped=${skipCount} failed=${failCount}`,
    );
  }
  return { sent: okCount, skipped: skipCount, failed: failCount };
}

export async function runDevApiWelcomePass(): Promise<{ sent: number; skipped: number; failed: number }> {
  if (!welcomeEmailEnabled("dev_api_welcome")) return { sent: 0, skipped: 0, failed: 0 };
  const sent = db
    .select({ id: sentEmails.clerkUserId })
    .from(sentEmails)
    .where(eq(sentEmails.kind, "dev_api_welcome"));
  const rows = await db
    .select({ clerkUserId: apiKeys.clerkUserId })
    .from(apiKeys)
    .where(notInArray(apiKeys.clerkUserId, sent))
    .groupBy(apiKeys.clerkUserId)
    .orderBy(sql`min(${apiKeys.createdAt})`)
    .limit(CAP);
  if (rows.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  const ids = rows.map((r) => r.clerkUserId);
  const clerk = await resolveClerk(ids);
  // Variant: short if they ALSO have a claimed profile. inArray (IN-list), not
  // sql`= any(array)` — the neon-http driver can't bind a JS array to ANY().
  // Also pull each id's nickname (if claimed) for the greeting.
  const claimRows = await db
    .select({ id: users.clerkUserId, nickname: users.nickname, evalId: users.evaluationId })
    .from(users)
    .where(and(isNotNull(users.evaluationId), inArray(users.clerkUserId, ids)));
  const claimed = new Set(claimRows.map((r) => r.id));
  const nicknameById = new Map(claimRows.map((r) => [r.id, r.nickname]));

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  for (const r of rows) {
    const info = clerk.get(r.clerkUserId);
    if (!info) continue;
    const email = info.email?.toLowerCase() ?? null;
    if (!email || NEVER_EMAIL.has(email)) {
      await markSent(r.clerkUserId, "dev_api_welcome");
      skipCount++;
      continue;
    }
    // Per-recipient isolation — see runClaimWelcomePass for the rationale.
    try {
      await sendDevApiWelcomeEmail({
        to: info.email!,
        firstName: firstNameFor(nicknameById.get(r.clerkUserId) ?? null, info.firstName, null),
        short: claimed.has(r.clerkUserId),
      });
      await markSent(r.clerkUserId, "dev_api_welcome");
      okCount++;
    } catch (err) {
      failCount++;
      console.error(
        `[welcome-sweep] dev_api_welcome send failed for ${r.clerkUserId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  if (okCount || failCount) {
    console.log(
      `[welcome-sweep] dev_api_welcome: sent=${okCount} skipped=${skipCount} failed=${failCount}`,
    );
  }
  return { sent: okCount, skipped: skipCount, failed: failCount };
}
