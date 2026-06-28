import type { LeaderboardRow, LeaderboardTab } from "@/lib/leaderboard";
import { encodeCursor } from "@/lib/leaderboard-cursor";

// Curated public row shape. Excludes the raw `profile` blob (PII/margin rule)
// and emits only badge ids (not internal badge state) in snake_case.
export type LeaderboardApiRow = {
  linkedin_url: string;
  // full_name is always the legal name. nickname is the member's chosen display
  // name (null when unset); clients should show nickname ?? full_name.
  full_name: string | null;
  nickname: string | null;
  company_name: string | null;
  company_url: string | null;
  profile_href: string;
  scores: { founder: number; investor: number; combined: number };
  badges: string[];
  founder_status: string | null;
  investor_status: string | null;
  canonical_industries: string[];
};

// Curate a single internal row into the public API row. Shared by the
// leaderboard and the search endpoint so both expose an identical shape.
export function toLeaderboardApiRow(r: LeaderboardRow): LeaderboardApiRow {
  return {
    linkedin_url: r.linkedinUrl,
    full_name: r.fullName,
    nickname: r.nickname,
    company_name: r.companyName,
    company_url: r.companyUrl,
    profile_href: r.profileHref,
    scores: { founder: r.founderScore, investor: r.investorScore, combined: r.combinedScore },
    badges: r.badges.filter((b) => b.status !== "rejected").map((b) => b.id),
    founder_status: r.founderStatus,
    investor_status: r.investorStatus,
    canonical_industries: r.canonicalIndustries ?? [],
  };
}

export function buildLeaderboardPayload(
  rows: LeaderboardRow[],
  opts: { sort: LeaderboardTab; limit: number },
): { results: LeaderboardApiRow[]; next_cursor: string | null } {
  const results: LeaderboardApiRow[] = rows.map(toLeaderboardApiRow);

  // A full page implies there may be more — emit a cursor from the last row's
  // sort key so the client can fetch the next page. A short page is the end.
  let next_cursor: string | null = null;
  if (rows.length === opts.limit && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    const score =
      opts.sort === "founder" ? last.founderScore
      : opts.sort === "investor" ? last.investorScore
      : last.combinedScore;
    next_cursor = encodeCursor({ score, id: last.id });
  }
  return { results, next_cursor };
}
