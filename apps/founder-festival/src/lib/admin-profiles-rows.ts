import "server-only";
import type { ScoredProfileRow } from "@/lib/profiles-scored";
import type { ProfileTableRow } from "@/components/admin/ProfilesScoredTable";
import { fmtLocation, fmtSubjectLocation, resolveEmails, resolvePhones, profileEmailInfo, profilePhoneInfo } from "@/lib/admin-profiles-view";
import { applyCostMultiplier } from "@/lib/cost-multiplier";

// Single source of truth for serializing ScoredProfileRow[] → ProfileTableRow[]
// (resolves claimer emails in one batched Clerk call). Used by the /admin/profiles
// page AND the pagination API so their row shape can't drift. `costMult` scales the
// displayed cost for the viewer (super = 1); charge stays un-multiplied.
export async function buildProfileTableRows(
  profiles: ScoredProfileRow[],
  costMult: number,
): Promise<ProfileTableRow[]> {
  const claimerIds = [
    ...new Set(profiles.map((p) => p.claimerClerkUserId).filter((x): x is string => !!x)),
  ];
  const [emailById, phoneById] = await Promise.all([resolveEmails(claimerIds), resolvePhones(claimerIds)]);
  return profiles.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    linkedinUrl: p.linkedinUrl,
    profileHref: p.profileHref,
    source: p.source,
    founderScore: p.founderScore,
    investorScore: p.investorScore,
    combinedScore: p.combinedScore,
    leaderboardRank: p.leaderboardRank,
    badges: p.badges,
    companyName: p.companyName,
    companyUrl: p.companyUrl,
    costCents: applyCostMultiplier(p.costCents, costMult),
    chargeCents: p.chargeCents,
    ...profileEmailInfo(p, emailById),
    ...profilePhoneInfo(p, phoneById),
    jobTitle: p.jobTitle,
    updatedAtIso: p.updatedAt.toISOString(),
    requestIp: p.requestIp,
    requestLocation: fmtLocation(p),
    subjectLocation: fmtSubjectLocation(p),
    subjectCity: p.subjectCity,
    subjectRegion: p.subjectRegion,
    subjectCountry: p.subjectCountry,
    runs: p.runs,
  }));
}
