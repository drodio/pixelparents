import { sql } from "drizzle-orm";
import { db } from "@/db";

// Unified "Pending Items" model: things that need a super-admin's attention,
// aggregated so the admin nav can show a single count badge and the Pending Items
// page can list them by category. Categories (additive over time):
//   - owner_edits   : score_items an owner edited, awaiting review (pre-existing)
//   - profile_conflict : ONE verified email mapped to ≥2 evaluations — either a
//       duplicate profile OR (worse) two different same-named people wrongly sharing
//       an email (e.g. an investor and an accountant both carrying user@example.com).
//       The admin merges / re-links / detaches.

export type ConflictProfile = {
  id: string;
  slug: string | null;
  fullName: string | null;
  linkedinUrl: string;
  signalQuality: string;
  founderScore: number;
  investorScore: number;
};
export type ProfileConflict = { email: string; profiles: ConflictProfile[] };

// neon-http db.execute returns rows in `.rows` (or the array directly on some
// drivers); normalize.
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] } | T[];
  return Array.isArray(r) ? (r as T[]) : (r.rows ?? []);
}

// One verified email → ≥2 distinct evaluations. Each group is one pending item.
export async function getProfileConflicts(): Promise<ProfileConflict[]> {
  const res = await db.execute(sql`
    SELECT pe.email AS email,
      json_agg(json_build_object(
        'id', e.id, 'slug', e.slug, 'fullName', e.full_name,
        'linkedinUrl', e.linkedin_url, 'signalQuality', e.signal_quality,
        'founderScore', e.founder_score, 'investorScore', e.investor_score
      ) ORDER BY (e.founder_score + e.investor_score) DESC) AS profiles
    FROM profile_emails pe
    JOIN evaluations e ON e.id = pe.evaluation_id
    WHERE pe.status = 'verified'
    GROUP BY pe.email
    HAVING count(DISTINCT pe.evaluation_id) > 1
    ORDER BY pe.email
  `);
  return rowsOf<{ email: string; profiles: ConflictProfile[] }>(res).map((r) => ({
    email: r.email,
    profiles: r.profiles ?? [],
  }));
}

async function countOf(res: unknown): Promise<number> {
  const rows = rowsOf<{ n: number | string }>(res);
  return Number(rows[0]?.n ?? 0);
}

// Cheap counts for the nav badge (runs on every admin page render).
export async function getPendingItemsCount(): Promise<number> {
  const [conflicts, ownerEdits] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS n FROM (
      SELECT email FROM profile_emails WHERE status='verified'
      GROUP BY email HAVING count(DISTINCT evaluation_id) > 1) t`),
    db.execute(sql`SELECT count(DISTINCT evaluation_id)::int AS n FROM score_items WHERE status='pending'`),
  ]);
  return (await countOf(conflicts)) + (await countOf(ownerEdits));
}
