// Derives the achievement-badge list for a profile from the persisted
// extracted metrics + claim state + MM rank. Pure function — drives both
// /profile and /leaderboard rendering.
import type { ExtractedMetrics } from "./scoring";
import { domainHost } from "./domain-normalize";
import { industryLabel } from "./industries";

// Visual groupings. Distinct color per category, so a profile with multiple
// money-related badges (Raised + Deployed) shows them in the same green and
// a profile mixing categories shows them in their own colors.
export type BadgeCategory =
  | "identity"   // Profile Claimed — gold
  | "yc"         // YC W22 etc. — orange
  | "founder"    // Serial / First-Time / Unicorn / Employees / IPO / Acquired / N Exits — blue
  | "money"      // Raised $X / $X Deployed — emerald
  | "investor"   // Partner at / Angel — violet
  | "builder"    // GitHub OSS — pink
  | "notability" // Wikipedia / Top X Web — zinc
  | "industry";  // AI/ML, Fintech, … (canonical industries) — turquoise

// Badge status drives the visual treatment (grayscale / colored / pending /
// hidden). Default for un-overridden system-computed pills is "likely" —
// rendered in grayscale so the user knows the AI inferred it but they
// haven't yet vouched for it.
export type BadgeStatus = "likely" | "confirmed" | "pending" | "rejected";

export type Badge = {
  id: string;
  label: string;
  category: BadgeCategory;
  status: BadgeStatus;
};

// One row from the `badge_overrides` table — the inputs to computeBadges
// for layering owner edits over the AI-inferred pills.
export type BadgeOverride = {
  badgeId: string;
  status: BadgeStatus;
  editedLabel: string | null;
};

// Tier option exposed to the edit picker for tiered pills. The picker shows
// these as radio choices; the user's selection becomes the new editedLabel.
export type BadgeEditOption = {
  value: number; // numeric threshold (for sorting / lookup)
  label: string; // display label (matches the tier label)
};

// Catalog of all badges the system knows about. Drives:
//   - the "+ add" picker on /profile (shows badges not already on the row)
//   - the edit picker for tiered pills (`tiers` is the option set)
//   - rendering category/color for owner-added pills that didn't come from
//     computeBadges in the first place.
export type BadgeCatalogEntry = {
  id: string;
  category: BadgeCategory;
  // Static label for non-tiered pills. For tiered pills this is null and the
  // tier label is chosen at edit time.
  label: string | null;
  // When the user adds a badge from the "+ add" picker, this is the default
  // label written into edited_label (smallest tier for tiered pills, the
  // static label otherwise).
  defaultLabel: string;
  // For tiered pills only — the full bucket list the edit picker shows.
  tiers: BadgeEditOption[] | null;
};

type MmHit = { domain: string; rank: number };

type BadgeInputs = {
  isClaimed: boolean;
  extractedMetrics: Partial<ExtractedMetrics> | null | undefined;
  mmHits: MmHit[] | null | undefined;
  // The subject's primary company domain (e.g. "stripe.com"). Used to
  // gate the "Top X Web" badge — without this, ANY high-ranked domain
  // that showed up in their Exa highlights (youtube.com, linkedin.com,
  // a press site) would falsely promote them into a top-rank tier.
  primaryCompanyDomain: string | null | undefined;
  // Investor facets projected onto the evaluations row from structured
  // enrichers (Neo, NFX). Each is the merged view; raw provenance is
  // in profile.enrichments[]. All optional — older evals predate this.
  investorStageFocus?: string[] | null | undefined;
  investorIndustryFocus?: string[] | null | undefined;
  investorLeadsRounds?: boolean | null | undefined;
  onNeo?: boolean | null | undefined;
  // Canonical industry slugs for the subject (e.g. ["ai-ml", "fintech"]).
  // Rendered as turquoise "industry" badges, each linking to that industry's
  // leaderboard filter. Optional — pass [] / null to omit them (the leaderboard
  // does, since it filters by industry in its own sidebar).
  canonicalIndustries?: string[] | null | undefined;
};

// Recognized stage labels → canonical badge label. The catch-all `Other Stage`
// is intentionally suppressed (badges only fire for stages we recognize, so we
// don't litter the profile with whatever free-text the enricher emitted).
const STAGE_BADGE_MAP: Array<{ match: RegExp; label: string }> = [
  { match: /pre[\s-]?seed/i,        label: "Pre-Seed Focus" },
  { match: /\bseed\b/i,             label: "Seed Focus" },
  { match: /series\s*a/i,           label: "Series A Focus" },
  { match: /series\s*b/i,           label: "Series B Focus" },
  { match: /series\s*c/i,           label: "Series C Focus" },
  { match: /growth|series\s*[def]/i, label: "Growth-Stage Focus" },
];
function stageBadgeIdFor(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Tiered ranges. Highest-matching tier wins; everything below is suppressed.
const RAISED_TIERS: Array<{ min: number; label: string }> = [
  { min: 1_000_000_000, label: "Raised $1B+" },
  { min: 500_000_000, label: "Raised $500M+" },
  { min: 200_000_000, label: "Raised $200M+" },
  { min: 150_000_000, label: "Raised $150M+" },
  { min: 100_000_000, label: "Raised $100M+" },
  { min: 75_000_000, label: "Raised $75M+" },
  { min: 50_000_000, label: "Raised $50M+" },
  { min: 40_000_000, label: "Raised $40M+" },
  { min: 30_000_000, label: "Raised $30M+" },
  { min: 25_000_000, label: "Raised $25M+" },
  { min: 20_000_000, label: "Raised $20M+" },
  { min: 15_000_000, label: "Raised $15M+" },
  { min: 10_000_000, label: "Raised $10M+" },
  { min: 5_000_000, label: "Raised $5M+" },
  { min: 4_000_000, label: "Raised $4M+" },
  { min: 3_000_000, label: "Raised $3M+" },
  { min: 2_000_000, label: "Raised $2M+" },
  { min: 1_000_000, label: "Raised $1M+" },
];

const EMPLOYEES_TIERS: Array<{ min: number; label: string }> = [
  { min: 10_000, label: "10,000+ Employees" },
  { min: 5_000, label: "5,000+ Employees" },
  { min: 1_000, label: "1,000+ Employees" },
  { min: 500, label: "500+ Employees" },
  { min: 250, label: "250+ Employees" },
  { min: 100, label: "100+ Employees" },
  { min: 50, label: "50+ Employees" },
  { min: 10, label: "10+ Employees" },
];

const DEPLOYED_TIERS: Array<{ min: number; label: string }> = [
  { min: 1_000_000_000, label: "$1B+ Deployed" },
  { min: 100_000_000, label: "$100M+ Deployed" },
  { min: 10_000_000, label: "$10M+ Deployed" },
  { min: 1_000_000, label: "$1M+ Deployed" },
];

function pickTier(
  tiers: Array<{ min: number; label: string }>,
  value: number,
): string | null {
  for (const t of tiers) if (value >= t.min) return t.label;
  return null;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${n}`;
}

// Return the lowest MM rank among hits whose domain matches the subject's
// primary company domain. Returns null if no match — which means we should
// NOT emit a "Top X Web" badge (the hits are unrelated press/social links).
function companyMmRank(
  hits: MmHit[] | null | undefined,
  primaryCompanyDomain: string | null | undefined,
): number | null {
  if (!hits || hits.length === 0 || !primaryCompanyDomain) return null;
  const target = domainHost(primaryCompanyDomain);
  let best: number | null = null;
  for (const h of hits) {
    const d = domainHost(h.domain);
    // Match either the exact primary domain or any subdomain of it.
    if (d === target || d.endsWith("." + target)) {
      if (best == null || h.rank < best) best = h.rank;
    }
  }
  return best;
}

// Layers owner overrides over the AI-computed pill list:
//   - status='confirmed' on a computed pill → mark confirmed (full color)
//   - status='pending'   on a computed pill → mark pending + use edited label
//   - status='rejected'  on a computed pill → omit (hidden)
//   - status='confirmed'/'pending' on a NON-computed pill (owner added one
//     the AI didn't infer) → append using catalog metadata for category/label
// Pills without an override default to status='likely' (grayscale).
export function computeBadges(
  inputs: BadgeInputs,
  overrides: BadgeOverride[] = [],
): Badge[] {
  const {
    isClaimed,
    extractedMetrics: m,
    mmHits,
    primaryCompanyDomain,
    investorStageFocus,
    investorIndustryFocus,
    investorLeadsRounds,
    onNeo,
    canonicalIndustries,
  } = inputs;
  const computed: Badge[] = [];
  const push = (b: Omit<Badge, "status">) => computed.push({ ...b, status: "likely" });

  if (isClaimed) {
    // "Profile Claimed" is auto-confirmed (not grayscale-likely) because the
    // claim event IS the user's confirmation — making them click ✓ to
    // confirm a pill that says "Profile Claimed" right after they claimed
    // would be redundant. Pushed with status="confirmed" instead of the
    // default "likely". An owner-side override (reject) still wins via the
    // override layering below.
    computed.push({
      id: "claimed",
      label: "Profile Claimed",
      category: "identity",
      status: "confirmed",
    });
  }

  if (m?.ycBatch) {
    push({ id: "yc", label: `YC ${m.ycBatch}`, category: "yc" });
  }

  // Founder seniority — only emit one, derived from the founded count.
  if (typeof m?.companiesFounded === "number") {
    if (m.companiesFounded >= 2) {
      push({ id: "serial-founder", label: "Serial Founder", category: "founder" });
    } else if (m.companiesFounded === 1) {
      push({ id: "first-founder", label: "First-Time Founder", category: "founder" });
    }
  }

  if (m?.isUnicornFounder) {
    push({ id: "unicorn", label: "Unicorn Founder", category: "founder" });
  }
  if (m?.hadIpo) {
    push({ id: "ipo", label: "IPO", category: "founder" });
  }
  if (m?.hadAcquisition) {
    push({ id: "acquired", label: "Acquired", category: "founder" });
  }

  // # Exits — only show when meaningfully > 1; "Exited" alone is implied by
  // IPO/Acquired so we suppress that tier to avoid double-counting.
  if (typeof m?.exitCount === "number" && m.exitCount >= 2) {
    push({
      id: "exits",
      label: m.exitCount >= 5 ? "5+ Exits" : `${m.exitCount} Exits`,
      category: "founder",
    });
  }

  if (typeof m?.totalRaisedUsd === "number" && m.totalRaisedUsd > 0) {
    const tier = pickTier(RAISED_TIERS, m.totalRaisedUsd);
    if (tier) push({ id: "raised", label: tier, category: "money" });
  }

  if (typeof m?.employeesCount === "number" && m.employeesCount >= 10) {
    const tier = pickTier(EMPLOYEES_TIERS, m.employeesCount);
    if (tier) push({ id: "employees", label: tier, category: "founder" });
  }

  if (m?.partnerAtFirm) {
    push({
      id: "partner",
      label: `Partner at ${m.partnerAtFirm}`,
      category: "investor",
    });
  }
  if (m?.isAngelInvestor) {
    push({ id: "angel", label: "Angel Investor", category: "investor" });
  }
  if (typeof m?.totalDeployedUsd === "number" && m.totalDeployedUsd >= 1_000_000) {
    const tier = pickTier(DEPLOYED_TIERS, m.totalDeployedUsd);
    if (tier) push({ id: "deployed", label: tier, category: "money" });
  }

  // Investor facets sourced from structured enrichers (Neo, NFX). De-duped by
  // canonical badge id so two stage strings that map to the same bucket
  // ("Seed (10-20 ppl)" and "seed-stage" both → "Seed Focus") show once.
  if (investorStageFocus && investorStageFocus.length > 0) {
    const emitted = new Set<string>();
    for (const raw of investorStageFocus) {
      const hit = STAGE_BADGE_MAP.find((s) => s.match.test(raw));
      if (!hit) continue;
      const id = stageBadgeIdFor(hit.label);
      if (emitted.has(id)) continue;
      emitted.add(id);
      push({ id, label: hit.label, category: "investor" });
    }
  }
  if (investorIndustryFocus && investorIndustryFocus.length > 0) {
    // Cap at 4 to avoid littering the row. Trim whitespace, skip empties.
    const items = investorIndustryFocus
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s): s is string => s.length > 0)
      .slice(0, 4);
    for (const ind of items) {
      const id = `industry-${stageBadgeIdFor(ind)}`;
      push({ id, label: `${ind} Focus`, category: "investor" });
    }
  }
  if (investorLeadsRounds === true) {
    push({ id: "leads-rounds", label: "Leads Rounds", category: "investor" });
  }
  if (onNeo === true) {
    push({ id: "on-neo", label: "Featured on Neo", category: "investor" });
  }

  if (m?.topGithubRepo && (m.topGithubRepoStars ?? 0) >= 1000) {
    push({
      id: "oss",
      label: `${m.topGithubRepo} (${formatStars(m.topGithubRepoStars!)}★)`,
      category: "builder",
    });
  }

  if (m?.onWikipedia) {
    push({ id: "wiki", label: "On Wikipedia", category: "notability" });
  }

  const rank = companyMmRank(mmHits, primaryCompanyDomain);
  if (rank != null) {
    if (rank <= 1000) push({ id: "mm", label: "Top 1k Web", category: "notability" });
    else if (rank <= 10_000) push({ id: "mm", label: "Top 10k Web", category: "notability" });
    else if (rank <= 100_000) push({ id: "mm", label: "Top 100k Web", category: "notability" });
  }

  // Industry badges (turquoise). Derived facts from the canonical industry
  // taxonomy — pushed as "confirmed" so they render in the category color, and
  // de-duped against any that somehow repeat. id = "industry:<slug>" so the
  // renderer can link each to /leaderboard?industry=<slug>.
  if (canonicalIndustries && canonicalIndustries.length > 0) {
    const seenInd = new Set<string>();
    for (const raw of canonicalIndustries) {
      const slug = typeof raw === "string" ? raw.trim() : "";
      if (!slug || seenInd.has(slug)) continue;
      seenInd.add(slug);
      computed.push({
        id: `industry:${slug}`,
        label: industryLabel(slug) ?? slug,
        category: "industry",
        status: "confirmed",
      });
    }
  }

  if (overrides.length === 0) return computed;

  // Layer overrides.
  const overrideById = new Map<string, BadgeOverride>();
  for (const o of overrides) overrideById.set(o.badgeId, o);

  const out: Badge[] = [];
  const seenIds = new Set<string>();
  for (const b of computed) {
    const o = overrideById.get(b.id);
    if (!o) {
      out.push(b);
    } else if (o.status === "rejected") {
      // omit
    } else if (o.status === "confirmed") {
      out.push({ ...b, status: "confirmed" });
    } else if (o.status === "pending") {
      out.push({ ...b, status: "pending", label: o.editedLabel ?? b.label });
    } else if (o.status === "likely") {
      out.push(b);
    }
    seenIds.add(b.id);
  }
  // Append owner-added badges that aren't in the computed set.
  for (const o of overrides) {
    if (seenIds.has(o.badgeId)) continue;
    if (o.status === "rejected" || o.status === "likely") continue;
    // Custom org (host/sponsor) badges carry an "org:<id>" badgeId that isn't in
    // BADGE_CATALOG; surface them from the override row alone (label = the
    // edited label set when applied), rendered as a gold "identity" pill.
    const cat = o.badgeId.startsWith("org:")
      ? { category: "identity" as BadgeCategory, defaultLabel: o.editedLabel ?? "Badge" }
      : BADGE_CATALOG[o.badgeId];
    if (!cat) continue; // unknown badge id; ignore safely
    out.push({
      id: o.badgeId,
      label: o.editedLabel ?? cat.defaultLabel,
      category: cat.category,
      status: o.status,
    });
  }
  return out;
}

// Catalog used by:
//   - the "+ add" picker on /profile (lists every id we know about)
//   - the edit picker for tiered pills (tiers[] is the option set)
//   - rendering owner-added pills whose id never came from computeBadges.
export const BADGE_CATALOG: Record<string, BadgeCatalogEntry> = {
  claimed: { id: "claimed", category: "identity", label: "Profile Claimed", defaultLabel: "Profile Claimed", tiers: null },
  yc: { id: "yc", category: "yc", label: null, defaultLabel: "YC", tiers: null },
  "serial-founder": { id: "serial-founder", category: "founder", label: "Serial Founder", defaultLabel: "Serial Founder", tiers: null },
  "first-founder": { id: "first-founder", category: "founder", label: "First-Time Founder", defaultLabel: "First-Time Founder", tiers: null },
  unicorn: { id: "unicorn", category: "founder", label: "Unicorn Founder", defaultLabel: "Unicorn Founder", tiers: null },
  ipo: { id: "ipo", category: "founder", label: "IPO", defaultLabel: "IPO", tiers: null },
  acquired: { id: "acquired", category: "founder", label: "Acquired", defaultLabel: "Acquired", tiers: null },
  exits: {
    id: "exits",
    category: "founder",
    label: null,
    defaultLabel: "2 Exits",
    tiers: [
      { value: 2, label: "2 Exits" },
      { value: 3, label: "3 Exits" },
      { value: 4, label: "4 Exits" },
      { value: 5, label: "5+ Exits" },
    ],
  },
  raised: {
    id: "raised",
    category: "money",
    label: null,
    defaultLabel: "Raised $1M+",
    tiers: RAISED_TIERS.slice().reverse().map((t) => ({ value: t.min, label: t.label })),
  },
  employees: {
    id: "employees",
    category: "founder",
    label: null,
    defaultLabel: "10+ Employees",
    tiers: EMPLOYEES_TIERS.slice().reverse().map((t) => ({ value: t.min, label: t.label })),
  },
  partner: { id: "partner", category: "investor", label: null, defaultLabel: "Partner at a VC firm", tiers: null },
  angel: { id: "angel", category: "investor", label: "Angel Investor", defaultLabel: "Angel Investor", tiers: null },
  "pre-seed-focus":     { id: "pre-seed-focus",     category: "investor", label: "Pre-Seed Focus",      defaultLabel: "Pre-Seed Focus",      tiers: null },
  "seed-focus":         { id: "seed-focus",         category: "investor", label: "Seed Focus",          defaultLabel: "Seed Focus",          tiers: null },
  "series-a-focus":     { id: "series-a-focus",     category: "investor", label: "Series A Focus",      defaultLabel: "Series A Focus",      tiers: null },
  "series-b-focus":     { id: "series-b-focus",     category: "investor", label: "Series B Focus",      defaultLabel: "Series B Focus",      tiers: null },
  "series-c-focus":     { id: "series-c-focus",     category: "investor", label: "Series C Focus",      defaultLabel: "Series C Focus",      tiers: null },
  "growth-stage-focus": { id: "growth-stage-focus", category: "investor", label: "Growth-Stage Focus",  defaultLabel: "Growth-Stage Focus",  tiers: null },
  "leads-rounds":       { id: "leads-rounds",       category: "investor", label: "Leads Rounds",        defaultLabel: "Leads Rounds",        tiers: null },
  "on-neo":             { id: "on-neo",             category: "investor", label: "Featured on Neo",     defaultLabel: "Featured on Neo",     tiers: null },
  deployed: {
    id: "deployed",
    category: "money",
    label: null,
    defaultLabel: "$1M+ Deployed",
    tiers: DEPLOYED_TIERS.slice().reverse().map((t) => ({ value: t.min, label: t.label })),
  },
  oss: { id: "oss", category: "builder", label: null, defaultLabel: "Open-source maintainer", tiers: null },
  wiki: { id: "wiki", category: "notability", label: "On Wikipedia", defaultLabel: "On Wikipedia", tiers: null },
  mm: {
    id: "mm",
    category: "notability",
    label: null,
    defaultLabel: "Top 100k Web",
    tiers: [
      { value: 100_000, label: "Top 100k Web" },
      { value: 10_000, label: "Top 10k Web" },
      { value: 1000, label: "Top 1k Web" },
    ],
  },
};

// Per-category Tailwind classes for the COLORED (confirmed) pill rendering.
// Imported by Badges.tsx so the palette stays consistent across /profile and
// /leaderboard.
export const BADGE_CATEGORY_CLASS: Record<BadgeCategory, string> = {
  identity: "border-[#dfa43a]/40 bg-[#dfa43a]/10 text-[#dfa43a]",
  yc: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  founder: "border-blue-400/40 bg-blue-400/10 text-blue-300",
  money: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  investor: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  builder: "border-pink-400/40 bg-pink-400/10 text-pink-300",
  notability: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  industry: "border-teal-400/40 bg-teal-400/10 text-teal-300",
};

// Grayscale fallback for un-confirmed (status='likely') pills — the AI
// inferred this badge but the owner hasn't yet vouched for it, so we render
// it in zinc until they confirm.
export const BADGE_LIKELY_CLASS =
  "border-zinc-700/60 bg-zinc-800/30 text-zinc-400";

// Pending pill style — owner edited the value and admin hasn't reviewed yet.
// Mirrors the yellow "Pending" pill used in ScoreTable for owner-modified
// score-items so the two surfaces feel consistent.
export const BADGE_PENDING_CLASS =
  "border-[#dfa43a]/60 bg-[#dfa43a]/15 text-[#dfa43a]";

export function badgeClassFor(b: Badge): string {
  if (b.status === "confirmed") return BADGE_CATEGORY_CLASS[b.category];
  if (b.status === "pending") return BADGE_PENDING_CLASS;
  return BADGE_LIKELY_CLASS;
}
