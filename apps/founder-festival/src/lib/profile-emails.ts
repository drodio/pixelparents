import { db } from "@/db";
import { profileEmails } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

// One email per (profile, address); each carries its own status + provenance.
export type EmailStatusValue = "verified" | "unverified";
export type EmailSource = "operator" | "anymailfinder" | "linkedin";
export type ProfileEmail = {
  email: string;
  status: EmailStatusValue;
  source: EmailSource;
  addedAt?: Date;
};

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Display/CSV order: verified first, then unverified; tie-break most-recent.
export function orderEmailsForDisplay(emails: ProfileEmail[]): ProfileEmail[] {
  const rank = (s: EmailStatusValue) => (s === "verified" ? 0 : 1);
  return [...emails].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0),
  );
}

// Upsert an email for a profile. Status precedence: a `verified` row is never
// downgraded to `unverified`; an incoming `verified` upgrades an existing
// `unverified` row (keeping the original source/addedBy is acceptable; we adopt
// the verified source so provenance reflects the trusted write).
export async function upsertProfileEmail(
  evaluationId: string,
  email: string,
  status: EmailStatusValue,
  source: EmailSource,
  addedBy?: string | null,
): Promise<void> {
  const norm = normalizeEmail(email);
  if (!isEmail(norm)) return;
  await db
    .insert(profileEmails)
    .values({ evaluationId, email: norm, status, source, addedBy: addedBy ?? null })
    .onConflictDoUpdate({
      target: [profileEmails.evaluationId, profileEmails.email],
      set: {
        // Keep verified if already verified; otherwise take the incoming status.
        status: sql`CASE WHEN ${profileEmails.status} = 'verified' THEN 'verified' ELSE excluded.status END`,
        source: sql`CASE WHEN ${profileEmails.status} = 'verified' THEN ${profileEmails.source} ELSE excluded.source END`,
      },
    });
}

export async function listProfileEmails(evaluationId: string): Promise<ProfileEmail[]> {
  const rows = await db
    .select()
    .from(profileEmails)
    .where(eq(profileEmails.evaluationId, evaluationId));
  return rows.map((r) => ({
    email: r.email,
    status: r.status as EmailStatusValue,
    source: r.source as EmailSource,
    addedAt: r.addedAt,
  }));
}
