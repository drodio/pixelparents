// Canonical industry taxonomy + normalizer.
//
// Founder and investor industry signals arrive as messy FREE TEXT — investor
// enrichers (Neo / NFX) emit `investorIndustryFocus` strings like "Fintech",
// "financial services", "FinTech", "payments"; founder industries will be
// derived from the company / Exa / HN. To make industries countable, filterable,
// and dedup'd on the leaderboard, every free-text value normalizes to ONE
// canonical slug in this taxonomy. The leaderboard agent consumes the slug→label
// map (INDUSTRY_LABELS) + writes the `industry=<slug>` filter against the
// `canonical_industries text[]` column this module populates.
//
// v1 list — refine against real prod `investorIndustryFocus` values over time.
// Unknown free text normalizes to `null` (we don't invent an "Other" bucket;
// unmatched strings simply don't become a canonical industry).

export type IndustrySlug =
  | "ai-ml" | "fintech" | "healthcare" | "biotech" | "saas" | "enterprise"
  | "devtools" | "security" | "data" | "consumer" | "marketplace" | "ecommerce"
  | "crypto" | "climate" | "edtech" | "proptech" | "insurtech" | "legaltech"
  | "hrtech" | "martech" | "logistics" | "mobility" | "gaming" | "media"
  | "social" | "hardware" | "robotics" | "space" | "agtech" | "govtech"
  | "defense" | "travel" | "manufacturing" | "creator";

type Entry = { slug: IndustrySlug; label: string; synonyms: string[] };

// Each entry's `synonyms` are lowercased phrases we match against (in addition
// to the slug and the label itself). Order matters only for readability; the
// matcher tries the most specific signals first.
const TAXONOMY: Entry[] = [
  { slug: "ai-ml", label: "AI / ML", synonyms: ["ai", "a.i.", "artificial intelligence", "machine learning", "ml", "deep learning", "llm", "llms", "genai", "generative ai", "ai/ml", "ai infrastructure", "applied ai"] },
  { slug: "fintech", label: "Fintech", synonyms: ["financial services", "finance", "financial", "payments", "banking", "neobank", "lending", "wealth", "wealthtech", "capital markets", "fin tech"] },
  { slug: "healthcare", label: "Healthcare", synonyms: ["health", "healthtech", "health tech", "digital health", "medical", "medtech", "med tech", "telehealth", "wellness", "mental health"] },
  { slug: "biotech", label: "Biotech", synonyms: ["bio", "biotechnology", "life sciences", "pharma", "pharmaceuticals", "drug discovery", "genomics", "therapeutics", "synthetic biology", "bioengineering"] },
  { slug: "saas", label: "SaaS", synonyms: ["software as a service", "b2b saas", "vertical saas", "cloud software"] },
  { slug: "enterprise", label: "Enterprise Software", synonyms: ["enterprise", "b2b", "enterprise software", "business software", "productivity", "workflow", "ops", "operations"] },
  { slug: "devtools", label: "Developer Tools", synonyms: ["developer tools", "dev tools", "devtools", "developer", "infrastructure", "infra", "platform engineering", "apis", "open source", "oss", "cloud infrastructure", "databases"] },
  { slug: "security", label: "Security", synonyms: ["cybersecurity", "cyber", "infosec", "security", "privacy", "identity", "auth"] },
  { slug: "data", label: "Data & Analytics", synonyms: ["data", "analytics", "big data", "data infrastructure", "business intelligence", "bi", "data science"] },
  { slug: "consumer", label: "Consumer", synonyms: ["consumer", "consumer tech", "b2c", "consumer apps", "mobile apps", "consumer products", "dtc", "d2c"] },
  { slug: "marketplace", label: "Marketplace", synonyms: ["marketplaces", "marketplace", "two-sided marketplace", "platforms", "gig economy"] },
  { slug: "ecommerce", label: "E-commerce", synonyms: ["e-commerce", "ecommerce", "commerce", "retail", "retailtech", "shopping"] },
  { slug: "crypto", label: "Crypto / Web3", synonyms: ["crypto", "web3", "web 3", "blockchain", "defi", "nft", "nfts", "digital assets", "tokens"] },
  { slug: "climate", label: "Climate / Energy", synonyms: ["climate", "climate tech", "cleantech", "clean tech", "energy", "sustainability", "carbon", "renewables", "solar"] },
  { slug: "edtech", label: "EdTech", synonyms: ["edtech", "ed tech", "education", "education technology", "learning", "e-learning"] },
  { slug: "proptech", label: "PropTech / Real Estate", synonyms: ["proptech", "prop tech", "real estate", "realestate", "construction", "contech"] },
  { slug: "insurtech", label: "Insurtech", synonyms: ["insurtech", "insurance", "insure tech"] },
  { slug: "legaltech", label: "LegalTech", synonyms: ["legaltech", "legal tech", "legal", "law", "regtech", "compliance"] },
  { slug: "hrtech", label: "HR Tech", synonyms: ["hrtech", "hr tech", "hr", "human resources", "future of work", "recruiting", "talent", "people ops"] },
  { slug: "martech", label: "Marketing Tech", synonyms: ["martech", "mar tech", "marketing", "adtech", "ad tech", "advertising", "growth", "sales tech", "salestech", "crm"] },
  { slug: "logistics", label: "Logistics / Supply Chain", synonyms: ["logistics", "supply chain", "supply-chain", "freight", "shipping", "fulfillment", "warehousing"] },
  { slug: "mobility", label: "Mobility / Transportation", synonyms: ["mobility", "transportation", "transport", "automotive", "auto", "ev", "electric vehicles", "av", "autonomous vehicles", "rideshare"] },
  { slug: "gaming", label: "Gaming", synonyms: ["gaming", "games", "video games", "game", "esports", "interactive entertainment"] },
  { slug: "media", label: "Media / Entertainment", synonyms: ["media", "entertainment", "content", "streaming", "music", "video", "publishing"] },
  { slug: "social", label: "Social", synonyms: ["social", "social media", "social networks", "community", "communities", "dating", "messaging"] },
  { slug: "hardware", label: "Hardware", synonyms: ["hardware", "iot", "internet of things", "devices", "electronics", "semiconductors", "chips", "semi"] },
  { slug: "robotics", label: "Robotics", synonyms: ["robotics", "robots", "automation", "industrial automation", "drones"] },
  { slug: "space", label: "Space", synonyms: ["space", "spacetech", "space tech", "aerospace", "satellites"] },
  { slug: "agtech", label: "AgTech / Food", synonyms: ["agtech", "ag tech", "agriculture", "agritech", "food", "foodtech", "food tech", "foodtech", "alt protein"] },
  { slug: "govtech", label: "GovTech", synonyms: ["govtech", "gov tech", "government", "public sector", "civictech", "civic tech"] },
  { slug: "defense", label: "Defense", synonyms: ["defense", "defence", "national security", "deftech", "military", "dual-use"] },
  { slug: "travel", label: "Travel / Hospitality", synonyms: ["travel", "traveltech", "hospitality", "tourism", "hotels"] },
  { slug: "manufacturing", label: "Manufacturing / Industrial", synonyms: ["manufacturing", "industrial", "industry 4.0", "factory", "3d printing", "materials"] },
  { slug: "creator", label: "Creator Economy", synonyms: ["creator", "creator economy", "creators", "influencer", "no-code", "nocode", "low-code"] },
];

export const INDUSTRY_SLUGS: IndustrySlug[] = TAXONOMY.map((e) => e.slug);
export const INDUSTRY_LABELS: Record<IndustrySlug, string> = Object.fromEntries(
  TAXONOMY.map((e) => [e.slug, e.label]),
) as Record<IndustrySlug, string>;

export function industryLabel(slug: string): string | null {
  return (INDUSTRY_LABELS as Record<string, string>)[slug] ?? null;
}

// Pre-build a phrase→slug index (slug, label, and every synonym, all lowercased).
const PHRASE_INDEX: Map<string, IndustrySlug> = (() => {
  const m = new Map<string, IndustrySlug>();
  for (const e of TAXONOMY) {
    m.set(e.slug, e.slug);
    m.set(e.label.toLowerCase(), e.slug);
    for (const s of e.synonyms) m.set(s, e.slug);
  }
  return m;
})();

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s*(?:focus|investing|investor|sector|vertical|industry|space)\s*$/g, "") // drop trailing role words
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize one free-text industry string to a canonical slug, or null if no
// confident match. Tries: exact phrase hit, then a token-overlap fallback so
// "B2B Fintech Payments" still resolves to fintech.
export function normalizeIndustry(text: string | null | undefined): IndustrySlug | null {
  if (!text) return null;
  const c = clean(text);
  if (!c) return null;
  // 1. Exact phrase match (slug / label / synonym).
  const exact = PHRASE_INDEX.get(c);
  if (exact) return exact;
  // 2. Any indexed phrase appears as a whole-word substring of the input.
  for (const [phrase, slug] of PHRASE_INDEX) {
    if (phrase.length < 3) continue;
    const re = new RegExp(`(?:^|\\W)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\W|$)`);
    if (re.test(c)) return slug;
  }
  return null;
}

// Normalize + dedupe a list of free-text industries into canonical slugs,
// preserving first-seen order. This is what populates `canonical_industries`.
export function canonicalizeIndustries(texts: Array<string | null | undefined>): IndustrySlug[] {
  const out: IndustrySlug[] = [];
  const seen = new Set<IndustrySlug>();
  for (const t of texts) {
    const slug = normalizeIndustry(t);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}
