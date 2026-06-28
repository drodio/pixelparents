import { desc, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  evaluations,
  familyMembers,
  profileEmails,
  recommendationResponses,
  recommendationVisibility,
} from "@/db/schema";
import { profileUrlFor } from "@/lib/profile-slug";
import { computeAge, relationshipLabel } from "@/lib/family-constants";

// Admin "Claimed Profiles": everyone who has claimed a profile, with FULL admin
// visibility into members-only data (family/pets, event answers, etc.). The list
// loads upfront; each row's detail loads lazily on expand (loadClaimedProfileDetail).

const RATING_LABELS = ["Unlikely", "Possibly", "Probably", "Definitely"] as const;
const familyVisibilityLabel = (v: string) => (v === "all_claimed" ? "All claimed users" : "Specific users");

export type AttendedEvent = { slug: string; title: string };

export type ClaimedProfileRow = {
  evalId: string;
  name: string;
  fullName: string | null;
  profileHref: string;
  email: string | null;
  founderScore: number;
  investorScore: number;
  combinedScore: number;
  claimedAt: string | null;
  matchConfidence: string | null;
  location: string | null;
  imageUrl: string | null;
  // Number of IRL-event questions they put a score on.
  answerCount: number;
  // Non-removed event attendances → one badge each, linking to /events/<slug>.
  events: AttendedEvent[];
  // Whether the expandable detail has anything in it (family/pets, event
  // answers, or emails). Rows with no members-only data aren't expandable.
  hasDetail: boolean;
};

// Claimer login emails live in Clerk, not our DB. Batch-resolve primary emails
// for a set of Clerk user ids (chunked to Clerk's 100-id page limit). Returns a
// clerkUserId → email map; ids Clerk can't resolve are simply absent.
async function claimerEmails(clerkUserIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(clerkUserIds.filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const clerk = await clerkClient();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const res = await clerk.users.getUserList({ userId: chunk, limit: 100 });
      for (const u of res.data) {
        const email =
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u.emailAddresses[0]?.emailAddress;
        if (email) out.set(u.id, email);
      }
    }
  } catch {
    // Clerk lookup is best-effort — fall back to the DB profile_email per row.
  }
  return out;
}

// One row per claimed evaluation (a profile with a users claim). Picks the
// "primary" claim row (high-confidence, most recently verified) when a profile
// has multiple claimers. Sorted by combined score desc.
export async function loadClaimedProfiles(): Promise<ClaimedProfileRow[]> {
  const res = await db.execute(sql`
    WITH primary_claim AS (
      SELECT DISTINCT ON (evaluation_id)
        evaluation_id, clerk_user_id, nickname, clerk_username, city, region, country,
        verified_at, match_confidence, clerk_image_url
      FROM users
      WHERE evaluation_id IS NOT NULL
      ORDER BY evaluation_id, (match_confidence = 'high') DESC, verified_at DESC NULLS LAST
    )
    SELECT e.id::text AS eval_id, e.full_name, e.slug, e.slug_kind,
      e.score, e.founder_score, e.investor_score,
      c.clerk_user_id, c.nickname, c.clerk_username, c.city, c.region, c.country,
      c.verified_at, c.match_confidence, c.clerk_image_url,
      (SELECT email FROM profile_emails pe WHERE pe.evaluation_id = e.id
        ORDER BY (status = 'verified') DESC, added_at ASC LIMIT 1) AS fallback_email,
      (SELECT count(*) FROM recommendation_responses rr WHERE rr.evaluation_id = e.id) AS answer_count,
      EXISTS(SELECT 1 FROM family_members fm WHERE fm.evaluation_id = e.id) AS has_family,
      EXISTS(SELECT 1 FROM profile_emails pe WHERE pe.evaluation_id = e.id) AS has_emails,
      COALESCE((
        SELECT json_agg(json_build_object('slug', ev.slug, 'title', ev.title) ORDER BY ev.starts_at DESC)
        FROM event_attendees ea
        JOIN events ev ON ev.id = ea.event_id
        WHERE ea.evaluation_id = e.id AND ea.removed_by_admin = false
      ), '[]'::json) AS events
    FROM primary_claim c
    JOIN evaluations e ON e.id = c.evaluation_id
    ORDER BY e.score DESC, e.full_name ASC`);
  const rows = (Array.isArray(res) ? res : (res as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];

  const emailByClerkId = await claimerEmails(rows.map((r) => String(r.clerk_user_id ?? "")));

  return rows.map((r) => {
    const loc = [r.city, r.region, r.country].filter((x) => !!x).join(", ") || null;
    const answerCount = Number(r.answer_count ?? 0);
    // Dedup events by slug (a person can have >1 attendee row per event).
    const rawEvents = (r.events as AttendedEvent[] | null) ?? [];
    const seen = new Set<string>();
    const events = rawEvents.filter((ev) => ev?.slug && !seen.has(ev.slug) && seen.add(ev.slug));
    return {
      evalId: String(r.eval_id),
      name: (r.nickname as string)?.trim() || (r.full_name as string) || "(unnamed)",
      fullName: (r.full_name as string) ?? null,
      profileHref: profileUrlFor({
        evalId: String(r.eval_id),
        slug: r.slug as string | null,
        slugKind: r.slug_kind as string | null,
        clerkUsername: r.clerk_username as string | null,
      }),
      email: emailByClerkId.get(String(r.clerk_user_id ?? "")) ?? (r.fallback_email as string) ?? null,
      founderScore: Number(r.founder_score ?? 0),
      investorScore: Number(r.investor_score ?? 0),
      combinedScore: Number(r.score ?? 0),
      claimedAt: r.verified_at ? String(r.verified_at) : null,
      matchConfidence: (r.match_confidence as string) ?? null,
      location: loc,
      imageUrl: (r.clerk_image_url as string) ?? null,
      answerCount,
      events,
      hasDetail: Boolean(r.has_family) || answerCount > 0 || Boolean(r.has_emails),
    };
  });
}

export type FamilyDetail = {
  label: string; // e.g. "9 year old son" / "Dog: Rex"
  relationship: string;
  age: number | null;
  interests: string[];
  visibility: string;
  publicBadge: string | null; // what shows publicly, or null if private
  photoHref: string | null;
};

export type EventAnswerDetail = { description: string; score: string; visibility: string };

export type EmailDetail = { email: string; status: string };

export type ClaimedProfileDetail = {
  family: FamilyDetail[];
  eventAnswers: EventAnswerDetail[];
  emails: EmailDetail[];
};

type RecItem = { id: string; text: string };

// Full per-profile detail for admins — ALL data regardless of members-only flags.
export async function loadClaimedProfileDetail(evalId: string): Promise<ClaimedProfileDetail> {
  const [ev] = await db
    .select({ recommendations: evaluations.recommendations })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);

  const [family, responses, privacyRows, emails] = await Promise.all([
    db.select().from(familyMembers).where(eq(familyMembers.evaluationId, evalId)).orderBy(desc(familyMembers.createdAt)),
    db
      .select({ itemId: recommendationResponses.itemId, rating: recommendationResponses.rating, editedText: recommendationResponses.editedText })
      .from(recommendationResponses)
      .where(eq(recommendationResponses.evaluationId, evalId)),
    db.select({ itemId: recommendationVisibility.itemId }).from(recommendationVisibility).where(eq(recommendationVisibility.evaluationId, evalId)),
    db.select({ email: profileEmails.email, status: profileEmails.status }).from(profileEmails).where(eq(profileEmails.evaluationId, evalId)),
  ]);

  const familyDetail: FamilyDetail[] = family.map((m) => {
    const rel = relationshipLabel(m.relationship, m.relationshipOther);
    const age = computeAge(m.birthdate ? String(m.birthdate).slice(0, 10) : null);
    const nameBit = m.firstName ? `: ${m.firstName}${m.lastName ? ` ${m.lastName}` : ""}` : "";
    const ageBit = age != null ? `${age}yo ` : "";
    return {
      label: `${ageBit}${rel}${nameBit}`.trim(),
      relationship: m.relationship,
      age,
      interests: m.interests ?? [],
      visibility: familyVisibilityLabel(m.visibility),
      publicBadge: m.publicShare && m.publicShare !== "none" ? rel : null,
      photoHref: m.photoUrl ? `/api/account/family/${m.id}/photo` : null,
    };
  });

  const items = ((ev?.recommendations as { items?: RecItem[] } | null)?.items ?? []) as RecItem[];
  const privateIds = new Set(privacyRows.map((p) => p.itemId));
  const eventAnswers: EventAnswerDetail[] = responses.map((r) => ({
    description: (r.editedText?.trim() || items.find((i) => i.id === r.itemId)?.text || "(untitled)").trim(),
    score: RATING_LABELS[(r.rating ?? 1) - 1] ?? String(r.rating),
    visibility: privateIds.has(r.itemId) ? "Private (members only)" : "Public",
  }));

  return { family: familyDetail, eventAnswers, emails };
}
