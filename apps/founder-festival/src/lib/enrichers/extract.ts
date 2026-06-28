import type { EnricherContext } from "./types";

// Best-effort name extraction from the LinkedIn page text and search results.
// LinkedIn profile titles usually look like "Jane Smith - CEO at Acme" or
// "Jane Smith | LinkedIn"; we take everything before the first delimiter.
export function extractFullName(ctx: Omit<EnricherContext, "fullName">): string | null {
  const fromLinkedinPage = firstName(ctx.linkedinPageText ?? "");
  if (fromLinkedinPage) return fromLinkedinPage;
  // Fallback: the first search highlight is usually the LinkedIn page itself.
  for (const r of ctx.searchHighlights) {
    if (!r.title) continue;
    const cleaned = firstName(r.title);
    if (cleaned) return cleaned;
  }
  // Last resort: turn the LinkedIn handle into a name guess. "jane-doe" → "Jane Doe".
  if (ctx.linkedinHandle) {
    const guess = ctx.linkedinHandle
      .replace(/[\-_]+/g, " ")
      .replace(/\d+$/g, "")
      .trim();
    if (guess && guess.length >= 3) {
      return guess
        .split(/\s+/)
        .map((p) => p[0]?.toUpperCase() + p.slice(1))
        .join(" ");
    }
  }
  return null;
}

// Strip common LinkedIn / SEO title decorations to keep just the human name.
function firstName(text: string): string | null {
  if (!text) return null;
  const first = text
    .split(/[\n|·•—\-]/)[0]
    ?.replace(/['"]/g, "")
    .trim();
  if (!first || first.length < 3 || first.length > 60) return null;
  // Sanity: at least one capitalized word and no obvious URL fragments
  if (!/^[A-Z]/.test(first)) return null;
  if (/https?:|linkedin/i.test(first)) return null;
  return first;
}

// Pull domains of recognizable platforms from the highlights so enrichers
// can short-circuit (e.g., "we already know the GitHub URL").
export function extractKnownUrls(ctx: Omit<EnricherContext, "fullName">): {
  github: string[];
  producthunt: string[];
  wikipedia: string[];
  crunchbase: string[];
  yc: string[];
  hackernews: string[];
  stackoverflow: string[];
  npm: string[];
  huggingface: string[];
  wikidata: string[];
  kaggle: string[];
} {
  const out = {
    github: [] as string[],
    producthunt: [] as string[],
    wikipedia: [] as string[],
    crunchbase: [] as string[],
    yc: [] as string[],
    hackernews: [] as string[],
    stackoverflow: [] as string[],
    npm: [] as string[],
    huggingface: [] as string[],
    wikidata: [] as string[],
    kaggle: [] as string[],
  };
  function consume(s: string | null | undefined) {
    if (!s || typeof s !== "string") return;
    const urlRe = /https?:\/\/[^\s)\]"']+/gi;
    const matches = s.match(urlRe) ?? [];
    for (const u of matches) {
      const lower = u.toLowerCase();
      if (lower.includes("github.com")) out.github.push(u);
      else if (lower.includes("producthunt.com")) out.producthunt.push(u);
      else if (lower.includes("wikipedia.org")) out.wikipedia.push(u);
      else if (lower.includes("crunchbase.com")) out.crunchbase.push(u);
      // news.ycombinator.com (Hacker News) MUST be checked before the YC
      // companies matcher below, since it also contains "ycombinator.com".
      else if (lower.includes("news.ycombinator.com")) out.hackernews.push(u);
      else if (lower.includes("ycombinator.com")) out.yc.push(u);
      else if (lower.includes("stackoverflow.com") || lower.includes("stackexchange.com")) out.stackoverflow.push(u);
      else if (lower.includes("npmjs.com")) out.npm.push(u);
      else if (lower.includes("huggingface.co")) out.huggingface.push(u);
      else if (lower.includes("wikidata.org")) out.wikidata.push(u);
      else if (lower.includes("kaggle.com")) out.kaggle.push(u);
    }
  }
  consume(ctx.linkedinPageText);
  for (const r of ctx.searchHighlights) {
    consume(r.url);
    if (r.title) consume(r.title);
    for (const h of r.highlights ?? []) consume(h);
  }
  // Dedupe
  for (const key of Object.keys(out) as Array<keyof typeof out>) {
    out[key] = [...new Set(out[key])];
  }
  return out;
}

// Pull plausible company names from the LinkedIn page text. Heuristic:
// look for patterns like "Founder at X", "CEO at X", "Co-Founder of X",
// "Founded X". Captures the company name up to a comma or period.
export function extractCompanyNames(linkedinPageText: string): string[] {
  if (!linkedinPageText) return [];
  const patterns = [
    /\b(?:Founder|Co-?Founder|CEO|Founding[^.]{0,30}|Started|Founded|Built|Created|Launched)\s+(?:and\s+\w+\s+)?(?:at|of|@)?\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?=[,.;\n]|$)/g,
  ];
  const found = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(linkedinPageText)) !== null) {
      const name = m[1]?.trim();
      if (name && name.length >= 2 && !/^(the|a|an|my)$/i.test(name)) {
        found.add(name);
      }
    }
  }
  return [...found].slice(0, 10);
}
