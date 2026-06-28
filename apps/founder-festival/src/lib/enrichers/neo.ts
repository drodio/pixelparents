import type { EnricherContext, EnrichmentResult } from "./types";

// Neo (neo.com) is a residency + mentorship community + VC fund. Their
// investor pages expose structured facts — firm role, stages, industries,
// leads-vs-follows, check size, accredited status, portfolio sketch — that
// our investor rubric otherwise tries to extract from text.
//
// Data access: neo.com runs on Bubble.io. Bubble exposes a PUBLIC Data API
// at /api/1.1/obj/<type>?constraints=[...] with NO AUTH for read-only
// queries. We use two types:
//   • person — LinkedIn URL, Twitter, check size, accredited, portfolio text
//   • user   — first/last name, firm, title, stages, industries, leads_deals,
//              slug, isVC, numEndorsements, etc. (linked from person.User)
//
// Match strategy (locked in during brainstorming): LinkedIn URL only.
// Bubble's `text contains "/in/<handle>"` constraint searches the
// `Social LinkedIn` field; we then post-filter on exact normalized handle
// to avoid `/in/handlelong` false positives. No name+firm fuzzy fallback.
//
// Failure handling matches every other enricher: any non-2xx, malformed
// JSON, or schema drift → return empty facts. Logged but doesn't break
// the eval.
//
// Cost: zero. Bubble Data API is free + unauthenticated for read.
// Latency: ~200-400ms parallel with the rest of the enricher mesh.

const API_BASE = "https://neo.com/api/1.1/obj";
const TIMEOUT_MS = 3000;

type NeoPerson = {
  _id: string;
  User?: string;
  "Social LinkedIn"?: string | null;
  "Social Twitter"?: string | null;
  WebsiteURL?: string | null;
  invCheckSize?: string | null;
  isAccredited?: boolean | null;
  invStartups?: string | null;
  Pronouns?: string | null;
};

type NeoUser = {
  _id: string;
  Slug?: string | null;
  "Profile First Name"?: string | null;
  "Profile Last Name"?: string | null;
  "Profile Org"?: string | null;
  "Profile Title"?: string | null;
  "Profile Bio"?: string | null;
  "Public Title mod"?: string | null;
  Region?: string | null;
  ApplyStages?: string[] | null;
  ApplyIndustries?: string[] | null;
  invLeadsDeals?: boolean | null;
  isVC?: boolean | null;
  isVisible?: boolean | null;
  numEndorsements?: number | null;
  Details?: string | null;
};

type BubbleResponse<T> = {
  response?: {
    cursor?: number;
    results?: T[];
    count?: number;
    remaining?: number;
  };
};

// Normalize a LinkedIn URL down to its handle for strict equality. Mirrors
// the helper inside nfx.ts so the two enrichers see the same handle for the
// same subject. Lowercases, strips https?:// + www., trailing slash, query.
export function linkedinHandleFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.toLowerCase().match(/linkedin\.com\/in\/([a-z0-9-]+)/);
  return m?.[1] ?? null;
}

async function bubbleGet<T>(type: string, constraints: unknown[], limit = 1): Promise<BubbleResponse<T> | null> {
  // Bubble parses the constraints JSON strictly — `+` for spaces (the
  // URLSearchParams default) breaks the field-name parser, so it sees
  // "Social+LinkedIn" instead of "Social LinkedIn". encodeURIComponent gives
  // us `%20` for spaces, which Bubble accepts.
  const encoded = encodeURIComponent(JSON.stringify(constraints));
  const url = `${API_BASE}/${type}?constraints=${encoded}&limit=${limit}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[neo] ${type} HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as BubbleResponse<T>;
  } catch (err) {
    console.warn(`[neo] ${type} failed`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Stage strings come back as e.g. "Pre-seed (1-10 ppl)" — strip the
// parenthetical team-size for badge labels.
export function cleanStageLabel(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Industry strings are user-edited free-form. Best-effort dedupe by
// lowercase compare; preserve the source casing for display.
export function dedupeCaseInsensitive(items: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    if (!s) continue;
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
  }
  return out;
}

// Parse Neo's text check-size range ("$500K - $2M", "$1M-$5M", "$25k–$100k")
// into numeric min/max USD. Returns null if it can't be parsed.
export function parseCheckSize(raw: string | null | undefined): {
  minUsd?: number;
  maxUsd?: number;
  rawText: string;
} | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const num = (s: string): number | null => {
    const m = s.match(/\$?\s*([\d.]+)\s*([kmb])?/i);
    if (!m) return null;
    const base = parseFloat(m[1]);
    if (!isFinite(base)) return null;
    const mult = m[2]?.toLowerCase();
    if (mult === "k") return base * 1_000;
    if (mult === "m") return base * 1_000_000;
    if (mult === "b") return base * 1_000_000_000;
    return base;
  };
  const sep = text.match(/[-–—]/);
  if (sep) {
    const [a, b] = text.split(/[-–—]/);
    const min = num(a ?? "");
    const max = num(b ?? "");
    return {
      ...(min != null ? { minUsd: min } : {}),
      ...(max != null ? { maxUsd: max } : {}),
      rawText: text,
    };
  }
  const single = num(text);
  if (single != null) return { minUsd: single, maxUsd: single, rawText: text };
  return { rawText: text };
}

export type NeoRaw = {
  slug: string;
  firm: string | null;
  title: string | null;
  region: string | null;
  stages: string[];
  industries: string[];
  leadsRounds: boolean | null;
  isVC: boolean;
  isAccredited: boolean | null;
  numEndorsements: number;
  checkSize: ReturnType<typeof parseCheckSize>;
  invStartupsText: string | null;
  publicTitle: string | null;
  profileUrl: string;
};

// Variants we'll try equals-match against Neo's `Social LinkedIn` field. Neo's
// stored URLs vary by user: with/without www, http/https, with/without trailing
// slash. `text contains` is keyword-based (NOT substring) on Bubble so we have
// to enumerate. Ordered by observed frequency in the live data — most hits land
// on the first or second variant.
export function neoLinkedinUrlVariants(handle: string): string[] {
  return [
    `https://www.linkedin.com/in/${handle}/`,
    `https://www.linkedin.com/in/${handle}`,
    `https://linkedin.com/in/${handle}/`,
    `https://linkedin.com/in/${handle}`,
    `http://www.linkedin.com/in/${handle}/`,
    `http://linkedin.com/in/${handle}`,
  ];
}

export async function enrichWithNeo(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "neo", facts: [], citations: [] };
  const handle = linkedinHandleFor(ctx.linkedinUrl);
  if (!handle) return empty;

  // Step 1: try equals-match against the common URL variants in turn. Stop at
  // the first hit. Worst case is ~6 cheap (uncached) calls to Bubble, ~600ms
  // — still well within the enricher mesh's parallel budget.
  let person: NeoPerson | null = null;
  for (const url of neoLinkedinUrlVariants(handle)) {
    const resp = await bubbleGet<NeoPerson>(
      "person",
      [{ key: "Social LinkedIn", constraint_type: "equals", value: url }],
      1,
    );
    const hit = resp?.response?.results?.[0];
    if (hit && linkedinHandleFor(hit["Social LinkedIn"]) === handle) {
      person = hit;
      break;
    }
  }
  if (!person?.User) return empty;

  // Step 2: fetch the user record by the person.User FK.
  const userResp = await bubbleGet<NeoUser>(
    "user",
    [{ key: "_id", constraint_type: "equals", value: person.User }],
    1,
  );
  const user = userResp?.response?.results?.[0];
  if (!user) return empty;

  // Only surface this as an investor signal when Neo flags the profile as a VC.
  // (Neo also has founders/operators in their user table; we don't want to
  // claim a non-investor is an investor.)
  if (!user.isVC) return empty;

  const slug = user.Slug ?? null;
  const stages = dedupeCaseInsensitive((user.ApplyStages ?? []).map(cleanStageLabel));
  const industries = dedupeCaseInsensitive(user.ApplyIndustries ?? []);
  const checkSize = parseCheckSize(person.invCheckSize);
  const profileUrl = slug ? `https://neo.com/investor/${slug}` : "https://neo.com/investors";

  const raw: NeoRaw = {
    slug: slug ?? "",
    firm: user["Profile Org"] ?? null,
    title: user["Profile Title"] ?? null,
    region: user.Region ?? null,
    stages,
    industries,
    leadsRounds: user.invLeadsDeals ?? null,
    isVC: true,
    isAccredited: person.isAccredited ?? null,
    numEndorsements: user.numEndorsements ?? 0,
    checkSize,
    invStartupsText: person.invStartups ?? null,
    publicTitle: user["Public Title mod"] ?? null,
    profileUrl,
  };

  const fullName = [user["Profile First Name"], user["Profile Last Name"]].filter(Boolean).join(" ").trim() || null;
  const firmPhrase = raw.firm ? ` at ${raw.firm}` : "";
  const titlePhrase = raw.title ?? "Member";
  const facts: string[] = [];
  facts.push(
    `Listed on Neo as ${fullName ?? "an investor"} (${titlePhrase}${firmPhrase}).`,
  );
  if (raw.publicTitle) facts.push(`Neo headline: "${raw.publicTitle}".`);
  if (raw.leadsRounds === true) facts.push("Leads rounds (per Neo profile).");
  else if (raw.leadsRounds === false) facts.push("Does not typically lead rounds (per Neo profile).");
  if (stages.length > 0) facts.push(`Invests at stages: ${stages.join(", ")}.`);
  if (industries.length > 0) {
    const shown = industries.slice(0, 8);
    const extra = industries.length - shown.length;
    facts.push(`Industry focus: ${shown.join(", ")}${extra > 0 ? ` (+${extra} more)` : ""}.`);
  }
  if (checkSize?.rawText) facts.push(`Check size: ${checkSize.rawText}.`);
  if (raw.isAccredited === true) facts.push("Accredited investor.");
  if (raw.invStartupsText) {
    facts.push(`Portfolio (per Neo): ${raw.invStartupsText.trim().slice(0, 280)}.`);
  }
  if (raw.numEndorsements > 0) {
    facts.push(`${raw.numEndorsements} endorsement${raw.numEndorsements === 1 ? "" : "s"} on Neo.`);
  }
  if (raw.region) facts.push(`Based in ${raw.region}.`);

  return {
    source: "neo",
    facts,
    citations: [profileUrl],
    raw,
  };
}
