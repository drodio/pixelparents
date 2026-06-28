// Founder & investor credibility vectors (FEAT-02, "spider graph"). PURE logic.
//
// We do NOT ask the model for vector scores (that would add noisy outputs on top
// of the score's existing ±50-100 run-to-run swing). Instead we DETERMINISTICALLY
// attribute each existing breakdown row to one of five vectors, sum the points,
// and percentile-rank against the scored population. Median is therefore 50 on
// every axis by construction — the radar's "typical" ghost is a regular pentagon.
//
// Two independent dimensions, each with its own five vectors + attribution maps:
//   - Founder: technical / traction / operator / domain / gtm
//   - Investor: portfolio / outcomes / firm / experience / capital
// Attribution is config (the maps below) — borderline calls are documented in
// docs/superpowers/specs/2026-05-26-founder-credibility-radar-design.md.

// breakdown parsing lives in the dependency-free single owner; re-exported here
// so existing `@/lib/credibility-vectors` importers keep working unchanged.
export { founderRows, investorRows } from "./breakdown-rows";
import type { BreakdownRow } from "./breakdown-rows";
export type { BreakdownRow };

// ---------------------------------------------------------------- Founder ----
export const VECTOR_KEYS = ["technical", "traction", "operator", "domain", "gtm"] as const;
export type VectorKey = (typeof VECTOR_KEYS)[number];

export const VECTOR_LABELS: Record<VectorKey, string> = {
  technical: "Technical Depth",
  traction: "Traction",
  operator: "Operator",
  domain: "Domain Expertise",
  gtm: "GTM / Distribution",
};
export const VECTOR_AXIS_LABELS: Record<VectorKey, string> = {
  technical: "Technical",
  traction: "Traction",
  operator: "Operator",
  domain: "Domain",
  gtm: "GTM",
};

// --------------------------------------------------------------- Investor ----
export const INVESTOR_VECTOR_KEYS = ["portfolio", "outcomes", "firm", "experience", "capital"] as const;
export type InvestorVectorKey = (typeof INVESTOR_VECTOR_KEYS)[number];

export const INVESTOR_VECTOR_LABELS: Record<InvestorVectorKey, string> = {
  portfolio: "Portfolio Scale",
  outcomes: "Exits & Outcomes",
  firm: "Firm Standing",
  experience: "Experience",
  capital: "Capital Deployed",
};
export const INVESTOR_VECTOR_AXIS_LABELS: Record<InvestorVectorKey, string> = {
  portfolio: "Portfolio",
  outcomes: "Exits",
  firm: "Firm",
  experience: "Experience",
  capital: "Capital",
};

// ------------------------------------------------------ attribution rules ----
type Rule = [RegExp, string];

// Match the citation-URL domain first (most reliable), then keyword-match the
// reason sentence (highest priority first).
function attributeWith<K extends string>(row: BreakdownRow, sourceRules: Rule[], reasonRules: Rule[]): K | null {
  for (const src of row.sources ?? []) {
    for (const [re, vec] of sourceRules) if (re.test(src)) return vec as K;
  }
  const reason = row.reason ?? "";
  for (const [re, vec] of reasonRules) if (re.test(reason)) return vec as K;
  return null;
}

// Founder
const SOURCE_DOMAIN_RULES: Rule[] = [
  [/github\.com/i, "technical"],
  [/stackoverflow\.com|stackexchange/i, "technical"],
  [/npmjs\.com/i, "technical"],
  [/huggingface\.co/i, "technical"],
  [/tkmx\.odio\.dev/i, "technical"],
  [/dev\.to|hashnode\.(?:com|dev)/i, "technical"],
  [/openalex\.org|orcid\.org|arxiv\.org|doi\.org|semanticscholar|scholar\.google/i, "domain"],
  [/producthunt\.com/i, "gtm"],
  [/sec\.gov|efts\.sec\.gov|edgar/i, "traction"],
];
const REASON_RULES: Rule[] = [
  // Content-derived signals win FIRST: a row whose reason explicitly states
  // "technical depth" / "domain expertise" (e.g. from the HN CONTENT ANALYSIS
  // rubric block) is attributed by its SUBSTANCE, not by the platform it came
  // from. Without these, a "technical depth via HN comments" row would match the
  // generic `hacker news → gtm` rule below and land in Distribution.
  [/technical depth|deep(?:ly)? technical|personal(?:ly)? technical/i, "technical"],
  [/domain expertise/i, "domain"],
  // GTM / operator SUBSTANCE — a row (often a PRESTIGE/press signal) that names
  // a specific competency routes to that axis, so e.g. "WSJ feature on their
  // go-to-market playbook" lands on GTM and "profiled for scaling the eng org"
  // on operator. A bare recognition with no competency phrase matches none of
  // these (or the rules below) and stays off the radar — by design.
  [/go-?to-?market|\bgtm\b|distribution (?:strategy|expertise|engine|playbook)|growth (?:strategy|playbook|expertise)/i, "gtm"],
  [/scal(?:ed|ing) (?:the |an |their )?(?:eng|engineering|team|teams|org|company|operations)|operating (?:expertise|experience)/i, "operator"],
  // Money/valuation. Catch BOTH abbreviated ("$91.5B") and spelled-out
  // ("$29 billion") amounts, and the bare words "valued"/"valuation"/"market
  // cap" — an audit found founder valuation rows written long-form ("valued at
  // over $29 billion") were matching NOTHING and dropping off the radar (e.g.
  // alexandr-wang lost all 29k of his traction points to null).
  [
    /rais(?:ed|ing)|funding|venture|\bseed\b|series [a-e]\b|\$\s?[\d.]+\s?(?:[mbk]|billion|million|trillion)\b|valu(?:ed|ation)|market cap/i,
    "traction",
  ],
  [/\bipo\b|went public|acquir|\bexit\b|\bsold\b|profitable|unicorn/i, "traction"],
  // Crunchbase company-scale / usage signals (web traffic, app downloads,
  // headcount). Placed AFTER the operator-scaling rule so "scaled the eng team"
  // still routes to operator; a bare headcount/usage figure is company TRACTION.
  // Also wins over the later `downloads? → technical` (npm) rule for app installs.
  [/monthly (?:website |web )?visits|web traffic|\bsemrush\b|apptopia|app(?:'s)? (?:installs?|downloads?)|total downloads|\bemployees\b/i, "traction"],
  [/majestic million|domain (?:rank|prominence)|ranked \d/i, "gtm"],
  [/product hunt|launch/i, "gtm"],
  // Generic HN reach (karma, post counts) → Distribution. Content rows already
  // routed above by the technical-depth/domain-expertise rules.
  [/hacker news|\bkarma\b/i, "gtm"],
  [/y combinator|\byc\b|accelerator|techstars/i, "operator"],
  [/co-?founders?|had co-?founder/i, "operator"],
  [/founder|co-?founded|founded|\bceo\b|chief|\bcto\b|\bcoo\b|operator|executive|\bvp\b|officer|tenure/i, "operator"],
  [/github|repositor|\bstars?\b|commits?\b/i, "technical"],
  [/stack overflow|reputation/i, "technical"],
  [/\bnpm\b|packages?\b|downloads?\b/i, "technical"],
  [/hugging face|\bmodels?\b/i, "technical"],
  [/tokenmaxx|tkmx|token-?max/i, "technical"],
  [/dev\.to|hashnode|technical article|technical (?:author|writer)/i, "technical"],
  [/h-?index|research|papers?\b|citation|publication|patent|inventor/i, "domain"],
  [/wikipedia|wikidata|notab/i, "domain"],
];
export const attributeRow = (row: BreakdownRow): VectorKey | null =>
  attributeWith<VectorKey>(row, SOURCE_DOMAIN_RULES, REASON_RULES);

// Investor. Order matters: outcomes → portfolio (needs a quantity, so a bare
// "angel investor with a portfolio" still falls through to firm) → firm role →
// capital → experience.
const INVESTOR_SOURCE_RULES: Rule[] = [
  [/crunchbase|cbinsights|pitchbook/i, "portfolio"],
];
const INVESTOR_REASON_RULES: Rule[] = [
  [/\bipo\b|went public|\bunicorn\b|acquir|reached unicorn|portfolio compan[a-z]* .*(?:public|acquir|exit)|\bexit(?:ed|s)?\b/i, "outcomes"],
  [/invest(?:ed|ments?)\b|\bbacked\b|\d+\+?[^.]{0,30}?(?:compan(?:y|ies)|startups?|investments?|deals?)|portfolio (?:of|spanning|across|including|incl)|active portfolio/i, "portfolio"],
  // Firm standing. The trailing `\binvestor\b` / `scout` is a deliberate
  // catch-all: a row whose only signal is "publicly identified as a seed/scout/
  // active investor" (no outcome, no portfolio count) has firm standing as its
  // honest home. It runs AFTER outcomes + portfolio, so anything quantifiable is
  // already routed; only bare-identity rows fall through here (they were landing
  // in null before — ~550 investor points lost across thin investor profiles).
  [/general partner|\bgp\b|managing (?:partner|director)|\bpartner\b|principal|angel investor|venture partner|fund manager|syndicate|founder of [^.]*(?:capital|ventures?|partners|fund)|leads? round|lead investor|\bscout\b|\binvestor\b/i, "firm"],
  [/deploy(?:ed|ing|s)?|assets under management|\baum\b|fund size|check size|\$\s?[\d.]+\s?[mb]\b/i, "capital"],
  [/experience|investing since|investing activity|decades?|\d+\+?\s*years|since (?:19|20)\d{2}|back to (?:at least )?(?:19|20)\d{2}|\b(?:19|20)\d{2}\b/i, "experience"],
];
export const attributeInvestorRow = (row: BreakdownRow): InvestorVectorKey | null =>
  attributeWith<InvestorVectorKey>(row, INVESTOR_SOURCE_RULES, INVESTOR_REASON_RULES);

// ----------------------------------------------------------- aggregation ----
export type VectorBucket = { points: number; rows: BreakdownRow[] };

function bucketRows<K extends string>(
  rows: BreakdownRow[],
  keys: readonly K[],
  attribute: (r: BreakdownRow) => K | null,
): Record<K, VectorBucket> {
  const out = Object.fromEntries(keys.map((k) => [k, { points: 0, rows: [] as BreakdownRow[] }])) as Record<
    K,
    VectorBucket
  >;
  for (const row of rows) {
    const vec = attribute(row);
    if (!vec) continue;
    out[vec].points += row.points;
    out[vec].rows.push(row);
  }
  for (const k of keys) out[k].points = Math.max(0, out[k].points);
  return out;
}

export const bucketByVector = (rows: BreakdownRow[]): Record<VectorKey, VectorBucket> =>
  bucketRows(rows, VECTOR_KEYS, attributeRow);
export const bucketInvestorByVector = (rows: BreakdownRow[]): Record<InvestorVectorKey, VectorBucket> =>
  bucketRows(rows, INVESTOR_VECTOR_KEYS, attributeInvestorRow);

export function rawVectorPoints(rows: BreakdownRow[]): Record<VectorKey, number> {
  const b = bucketByVector(rows);
  return Object.fromEntries(VECTOR_KEYS.map((k) => [k, b[k].points])) as Record<VectorKey, number>;
}
export function rawInvestorVectorPoints(rows: BreakdownRow[]): Record<InvestorVectorKey, number> {
  const b = bucketInvestorByVector(rows);
  return Object.fromEntries(INVESTOR_VECTOR_KEYS.map((k) => [k, b[k].points])) as Record<InvestorVectorKey, number>;
}

// Mid-rank percentile (0-100): (below + 0.5*equal) / total * 100. Ties share the
// midpoint, so a vector where everyone scores 0 puts a 0 at the median (50), not
// the floor — the honest "typical" position, lined up with the radar's 50 ghost.
export function percentileOf(value: number, population: number[]): number {
  if (population.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const p of population) {
    if (p < value) below++;
    else if (p === value) equal++;
  }
  return Math.round(((below + 0.5 * equal) / population.length) * 100);
}

// Percentile of `value` ranked ONLY against profiles that HAVE signal on this
// axis (raw points > 0) — not the whole population. The credibility population is
// heavily zero-inflated on sparse axes (most founders have NO technical/domain
// signal at all), so ranking against everyone made a thin nonzero score (e.g. a
// GitHub identity + dev.to presence, ~13 pts) read as the ~85th percentile — the
// "looks elite, isn't" artifact. Ranking only against signal-havers puts a thin
// score honestly mid-pack and reserves the top for real depth. A value of 0 (no
// signal on the axis) returns 0 — paired with `coverage: false` in the UI, that
// reads as "no signal", not a misleading number.
export function signalHaverPercentile(value: number, population: number[]): number {
  if (value <= 0) return 0;
  return percentileOf(value, population.filter((p) => p > 0));
}
