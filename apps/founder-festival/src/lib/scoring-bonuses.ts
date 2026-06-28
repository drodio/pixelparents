// Deterministic, post-scoring point bonuses applied to a ScoringResult in CODE
// (not by the LLM): Majestic Million domain prominence, company-org GitHub OSS,
// LinkedIn-follower reach, the enterprise-value dollar curve, and HN citation
// deep-linking. Each is best-effort — a lookup hiccup never fails the eval. The
// rubric tells the model NOT to award these itself, so they don't double-count.
// Split out of eval-pipeline.ts; the orchestrator (scoreInputs) calls these.
import {
  majesticMillionBonus,
  githubTopRepoPoints,
  curvedDollarPoints,
  type ScoringResult,
  type MMHit,
} from "./scoring";
import type { EnrichmentResult } from "./enrichers";
import { domainHostOrNull } from "./domain-normalize";
import { companyOrgTopRepo } from "./enrichers/github";
import { db } from "@/db";
import { majesticMillion } from "@/db/schema";
import { inArray } from "drizzle-orm";

export async function lookupMmRanksForDomains(domains: string[]): Promise<MMHit[]> {
  if (domains.length === 0) return [];
  const rows = await db
    .select()
    .from(majesticMillion)
    .where(inArray(majesticMillion.domain, domains));
  return rows.map((r) => ({ domain: r.domain, rank: r.rank }));
}

// Append the Majestic Million prominence bonus, computed in CODE from the
// RESOLVED company domain (the pre-scoring mmHits lookup runs before the LLM
// picks primaryCompanyDomain, so it usually misses the real company — that's why
// this is deterministic and post-scoring). Founders of the domain get the full
// log-curve bonus; non-founders ×0.1. Authoritative (a DB rank lookup), so the
// verification weighting leaves it at full value. Best-effort: never fails a score.
// Curve the dollar-magnitude founder rows in place (valuation / exit / raise) onto
// the square-root enterprise-value curve via curvedDollarPoints. Deterministic, no
// I/O. See scoring.ts for the curve + rationale. Each row is transformed
// independently (companies sum — no best-company weighting); a row whose rule isn't
// a dollar-magnitude one is untouched.
export function applyEnterpriseValueCurve(scoring: ScoringResult): void {
  for (const row of scoring.founderBreakdown) {
    const curved = curvedDollarPoints(row.rule, row.points);
    if (curved !== null) row.points = curved;
  }
}

// LinkedIn follower reach → founder distribution points, scored DETERMINISTICALLY
// at 1 point per 1,000 followers (floor) from the BrightData enricher's exact
// count (identity is exact — fetched by the subject's own profile URL). The
// rubric tells the model NOT to award follower points itself, so this doesn't
// double-count. Sources cite the LinkedIn profile so the finding nests under the
// "Looking you up on LinkedIn" waterfall step as a gold bullet. Best-effort:
// no BrightData result / sub-1k followers → no row.
export function addLinkedinFollowersBonus(
  scoring: ScoringResult,
  enrichments: EnrichmentResult[],
  linkedinUrl: string,
): void {
  try {
    const bd = enrichments.find((e) => e.source === "brightdata");
    const followers = Number((bd?.raw as { followers?: unknown } | undefined)?.followers);
    if (!Number.isFinite(followers) || followers < 1000) return;
    const points = Math.floor(followers / 1000);
    if (points <= 0) return;
    scoring.founderBreakdown.push({
      points,
      reason: `${followers.toLocaleString("en-US")} LinkedIn followers — broad professional reach.`,
      confidence: 95,
      verification: "authoritative",
      sources: [linkedinUrl],
      citations: [],
    });
  } catch {
    // reach is a bonus; never fail a score on it
  }
}

export async function addCompanyMmBonus(scoring: ScoringResult): Promise<void> {
  try {
    const domain = domainHostOrNull(scoring.primaryCompanyDomain);
    if (!domain) return;
    const [hit] = await lookupMmRanksForDomains([domain]);
    if (!hit) return;
    const isFounder = (scoring.extractedMetrics?.companiesFounded ?? 0) >= 1;
    const points = majesticMillionBonus(hit.rank, { isFounder });
    if (points <= 0) return;
    scoring.founderBreakdown.push({
      points,
      reason: `${domain} ranks #${hit.rank.toLocaleString("en-US")} on the Majestic Million (global domain prominence).`,
      confidence: 95,
      verification: "authoritative",
      sources: [],
      citations: [],
    });
  } catch {
    // Prominence is a bonus; a lookup hiccup must never break the eval.
  }
}

// Company-flagship OSS bonus (founder rubric, technical vector). The GitHub
// enricher only sees the subject's PERSONAL account — it runs before the company
// domain is resolved — so a founder whose real OSS lives in the company ORG (e.g.
// Geoff Schmidt: apollographql/apollo-server, meteor/meteor) was never credited
// for it. Like addCompanyMmBonus, this is deterministic + post-scoring, keyed on
// the RESOLVED primaryCompanyDomain: derive the org from the domain, look up its
// top-starred repo, and award the founder the same uncapped star curve the rubric
// uses for personal repos (rule "github_top_repo" → exempt from the +200 clamp;
// github.com source → attributed to the Technical Depth radar vector). The rubric
// tells the model NOT to award the company-org flagship itself, so this doesn't
// double-count. Founders only; best-effort (never fails a score).
export async function addCompanyGithubBonus(scoring: ScoringResult): Promise<void> {
  try {
    const domain = domainHostOrNull(scoring.primaryCompanyDomain);
    if (!domain) return;
    const isFounder = (scoring.extractedMetrics?.companiesFounded ?? 0) >= 1;
    if (!isFounder) return; // only credit company OSS to a founder of the company
    // Only credit a founder for their company's OSS as TECHNICAL DEPTH when they
    // are PERSONALLY technical. Otherwise a non-technical founder (e.g. Brian
    // Chesky) gets a huge technical bonus for OSS their company's engineers wrote
    // (airbnb/javascript → +129). The bonus is meant for technical creators like
    // Geoff Schmidt (Apollo/Meteor), not designer/business CEOs of OSS companies.
    if (scoring.technicalFounder !== true) return;
    const top = await companyOrgTopRepo(domain);
    if (!top) return;
    const points = githubTopRepoPoints(top.stars);
    if (points <= 0) return; // <100 stars → not a technical-depth signal
    const repoUrl = `https://github.com/${top.org}/${top.repo}`;
    const starsText = `${top.stars.toLocaleString("en-US")} stars`;
    scoring.founderBreakdown.push({
      points,
      reason: `Founded the company behind ${top.org}/${top.repo}, a flagship open-source project with ${starsText} on GitHub.`,
      confidence: 90,
      verification: "authoritative", // a live GitHub star count is an objective record
      sources: [repoUrl],
      citations: [{ phrase: starsText, sources: [repoUrl] }],
      rule: "github_top_repo",
    });
  } catch {
    // Company-OSS credit is a bonus; a GitHub hiccup must never break the eval.
  }
}

// Deep-link HN score rows to their source. The Hacker News enricher exposes the
// subject's profile + submissions URLs and each top post's HN item URL; this
// matches those against the model-written reason text and injects per-phrase
// citations so the UI renders them as clickable links — e.g. "4,506 karma" →
// the HN profile, "287 story posts" → their submissions feed, and a top post's
// title → that post on HN. Deterministic (no model dependence): the citation
// only lands when the exact phrase is present in the reason.
type HnRawLite = {
  handle?: string;
  profile_url?: string;
  submitted_url?: string;
  top_posts?: Array<{ title?: string | null; item_url?: string }>;
};

export function hnCitationsForReason(reason: string, hn: HnRawLite): Array<{ phrase: string; sources: string[] }> {
  const out: Array<{ phrase: string; sources: string[] }> = [];
  const add = (phrase: string | undefined | null, url: string | undefined | null) => {
    if (phrase && url && reason.includes(phrase)) out.push({ phrase, sources: [url] });
  };
  // karma figure or @handle → HN profile.
  add(reason.match(/[\d,]+\s+karma/i)?.[0], hn.profile_url);
  if (hn.handle) add(`@${hn.handle}`, hn.profile_url);
  // story-post / submission count → submissions feed.
  add(
    reason.match(/[\d,]+\s+story\s+(?:posts|submissions)/i)?.[0] ?? reason.match(/[\d,]+\s+submissions/i)?.[0],
    hn.submitted_url,
  );
  // Each top post's title → that post on HN (try the full title, then without a
  // "Show HN:" / "Ask HN:" prefix in case the model dropped it).
  for (const p of hn.top_posts ?? []) {
    const title = (p.title ?? "").trim();
    if (!title || !p.item_url) continue;
    if (reason.includes(title)) add(title, p.item_url);
    else {
      const short = title.replace(/^(?:Show|Ask|Tell)\s+HN:\s*/i, "").trim();
      if (short.length >= 8) add(short, p.item_url);
    }
  }
  return out;
}

export function applyHnCitations(scoring: ScoringResult, enrichments: EnrichmentResult[]): void {
  const hn = enrichments.find((e) => e.source === "hackernews")?.raw as HnRawLite | undefined;
  if (!hn) return;
  for (const row of [...scoring.founderBreakdown, ...scoring.investorBreakdown]) {
    const cites = hnCitationsForReason(row.reason, hn);
    if (cites.length === 0) continue;
    const existing = row.citations ?? [];
    const seen = new Set(existing.map((c) => `${c.phrase}|${c.sources.join(",")}`));
    for (const c of cites) {
      const key = `${c.phrase}|${c.sources.join(",")}`;
      if (!seen.has(key)) {
        existing.push(c);
        seen.add(key);
      }
    }
    row.citations = existing;
  }
}
