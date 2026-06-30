import { and, sql } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ensureFamiliesSchema } from "@/lib/db/ensure";
import { signups, type SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount } from "@/lib/family-display";
import { isFamilyVerified, hasShareableProfile } from "@/lib/directory";

// Member lookups for the Community board's @-mention feature. Thin reads over
// `signups`, mirroring lib/db/events.searchSignupsByName but adding the privacy
// gate mentions require: ONLY verified families are mentionable, names are
// coarsened for students (first-name only, matching the directory's minor rule),
// and a profile LINK is offered only when the member has a shareable profile —
// never a path to a private profile, and never a student's contact details. We
// call ensureFamiliesSchema() (the same self-heal the directory reads use) before
// every query; we do NOT touch the asks schema here.
//
// Note these reads project a SignupRow down to {signupId, name, isStudent, token}
// — they never carry email/phone, so an @-mention can't leak contact info.

// A mentionable member, as surfaced by the autocomplete + render path.
export type MentionableMember = {
  signupId: string;
  name: string;
  isStudent: boolean;
  // The /directory token IF (and only if) the member shares a profile; else null
  // (the mention renders as a non-linked coarsened name).
  token: string | null;
};

// Coarsened display name — students show first name only (minor coarsening).
function displayName(r: SignupRow): string {
  return isStudentAccount(r)
    ? r.firstName
    : [r.firstName, r.lastName].filter(Boolean).join(" ");
}

function toMentionable(r: SignupRow): MentionableMember {
  return {
    signupId: r.id,
    name: displayName(r),
    isStudent: isStudentAccount(r),
    token: hasShareableProfile(r) ? r.shareToken : null,
  };
}

// Live autocomplete for the @-mention picker: VERIFIED members whose name matches
// the prefix/substring. Case-insensitive over first/last/"first last". Excludes
// blank-name auto-save drafts and unverified families. Capped.
export async function searchMentionableMembers(
  query: string,
  limit = 8,
): Promise<MentionableMember[]> {
  await ensureFamiliesSchema();
  const q = query.trim();
  if (q.length < 1) return [];
  const like = `%${q.toLowerCase()}%`;
  const rows = await getDb()
    .select()
    .from(signups)
    .where(
      and(
        sql`coalesce(${signups.firstName}, '') <> ''`,
        sql`(
          lower(${signups.firstName}) like ${like}
          or lower(coalesce(${signups.lastName}, '')) like ${like}
          or lower(${signups.firstName} || ' ' || coalesce(${signups.lastName}, '')) like ${like}
        )`,
      ),
    )
    .limit(limit * 3); // over-fetch, then filter to verified in app
  return rows
    .filter((r) => isFamilyVerified(r))
    .slice(0, limit)
    .map(toMentionable);
}

// Resolve a set of signup ids to their mentionable view, dropping any that aren't
// verified (so a client-supplied marker for an unverified/unknown id is never
// authorized). Keyed by id for the action's normalize + notify step.
export async function resolveMentionables(
  ids: string[],
): Promise<Map<string, MentionableMember>> {
  const out = new Map<string, MentionableMember>();
  if (ids.length === 0) return out;
  await ensureFamiliesSchema();
  const rows = await getDb().select().from(signups).where(inArray(signups.id, ids));
  for (const r of rows) {
    if (!isFamilyVerified(r)) continue;
    if (!r.firstName?.trim()) continue;
    out.set(r.id, toMentionable(r));
  }
  return out;
}
