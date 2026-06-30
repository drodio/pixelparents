import type { EnricherContext, EnrichmentResult } from "./types";
import { fetchWithTimeout } from "../fetch-timeout";

// Personal-website enricher — KEYLESS. When the subject has a personal website
// (self-entered `websiteUrl`, else one discovered on their LinkedIn/identity
// surface), fetch the homepage (and best-effort /about) and extract useful,
// low-risk facts: <title>, meta description, the top headings, a short visible
// text snippet, and any social links the site advertises.
//
// Status contract (per the enrichment-visibility roster):
//   • no url available            → "no_data" (note: "no website URL")
//   • url present, nothing usable → "no_data"
//   • url present, facts found    → "ok"
//   • fetch threw / timed out      → "error"
// It needs no credential, so it NEVER emits "no_api_key".

const UA = "founder-festival-eval/1.0 (+https://festival.so)";
// Hard cap on bytes read from a page — defends against a multi-MB homepage
// stalling the eval or blowing memory. The signal we want (title/meta/headings)
// lives in the first chunk of the document.
const MAX_BYTES = 512 * 1024;
// Per-page fetch deadline. The enricher itself is also bounded by the registry's
// withEnricherTimeout, but a tighter per-fetch cap keeps a slow first page from
// eating the whole budget before we try /about.
const PAGE_TIMEOUT_MS = 6_000;

// Hosts that are NOT a personal website — platform profiles handled by their own
// enrichers. Used when DISCOVERING a website from surfaced URLs so we never pick,
// say, a linkedin.com or github.com URL as "the personal site."
const PLATFORM_HOSTS = [
  "linkedin.com", "github.com", "twitter.com", "x.com", "facebook.com",
  "instagram.com", "youtube.com", "youtu.be", "medium.com", "substack.com",
  "producthunt.com", "crunchbase.com", "wikipedia.org", "wikidata.org",
  "ycombinator.com", "kaggle.com", "huggingface.co", "stackoverflow.com",
  "npmjs.com", "t.co", "bit.ly", "lnkd.in", "google.com", "apple.com",
];

// Normalize a raw URL string to an https:// URL, or null if it isn't a usable
// http(s) website. Adds a scheme when the input is a bare host ("acme.com").
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    // Reject obvious non-URLs (spaces, no dot) before prepending a scheme.
    if (/\s/.test(s) || !s.includes(".")) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase();
  return PLATFORM_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

// Choose the subject's website URL. Priority: the self-entered `websiteUrl`
// (exact identity, no same-name risk), else the FIRST non-platform http(s) URL
// surfaced on their LinkedIn/identity data. Returns null when none is usable.
export function pickWebsiteUrl(
  selfEntered: string | null | undefined,
  candidateUrls: string[],
): string | null {
  const self = normalizeWebsiteUrl(selfEntered);
  if (self) return self;
  for (const c of candidateUrls) {
    const n = normalizeWebsiteUrl(c);
    if (n && !isPlatformHost(hostOf(n))) return n;
  }
  return null;
}

// Collect candidate website URLs from the subject's own LinkedIn/identity
// surface (page text + search-highlight URLs/highlights). Platform profiles are
// filtered out by pickWebsiteUrl, not here.
function candidateUrlsFromContext(ctx: EnricherContext): string[] {
  const out: string[] = [];
  const urlRe = /https?:\/\/[^\s)\]"'<>]+/gi;
  const consume = (s: string | null | undefined) => {
    if (!s) return;
    for (const m of s.match(urlRe) ?? []) out.push(m);
  };
  consume(ctx.linkedinPageText);
  for (const r of ctx.searchHighlights ?? []) {
    consume(r.url);
    consume(r.title);
    for (const h of r.highlights ?? []) consume(h);
  }
  return [...new Set(out)];
}

// Read a Response body up to MAX_BYTES, decoding as UTF-8. Aborts the stream
// once the cap is hit so we never buffer a giant page.
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) {
    // No stream (e.g. test mock returning text()) — fall back to .text() but
    // still slice to the cap.
    const t = await res.text();
    return t.slice(0, MAX_BYTES);
  }
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (value) out += decoder.decode(value, { stream: true });
      if (total >= MAX_BYTES) break;
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  return out;
}

// Fetch a page and return its (capped) HTML, or null on any non-OK / non-HTML /
// failure. Throws only on programmer error — network failures resolve to null so
// a missing /about doesn't error the whole enricher.
async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    url,
    { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, redirect: "follow" },
    PAGE_TIMEOUT_MS,
  );
  if (!res.ok) return null;
  const ctype = res.headers.get("content-type") ?? "";
  if (ctype && !/html|xml|text\/plain/i.test(ctype)) return null;
  const html = await readCapped(res);
  return html || null;
}

// ── Pure HTML extractors (unit-testable, no I/O) ──────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, " ").trim();
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? clean(m[1]!) : "";
  return t ? t.slice(0, 200) : null;
}

export function extractMetaDescription(html: string): string | null {
  // Match name="description" or property="og:description" in either attr order.
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const isDesc =
      /\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag);
    if (!isDesc) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([\s\S]*?)["']/i)?.[1];
    const c = content ? clean(content) : "";
    if (c) return c.slice(0, 300);
  }
  return null;
}

export function extractHeadings(html: string, max = 5): string[] {
  const out: string[] = [];
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = clean(m[2]!.replace(/<[^>]+>/g, " "));
    if (text && text.length >= 2) out.push(text.slice(0, 120));
    if (out.length >= max) break;
  }
  return [...new Set(out)];
}

// A short snippet of visible body text — strip script/style/markup, collapse
// whitespace, take the first ~300 chars. Best-effort "what does this site say."
export function extractVisibleSnippet(html: string, max = 300): string | null {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = clean(stripped);
  return text ? text.slice(0, max) : null;
}

const SOCIAL_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "LinkedIn", re: /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/[^\s"'<>]+/i },
  { label: "GitHub", re: /https?:\/\/(?:www\.)?github\.com\/[^\s"'<>]+/i },
  { label: "X/Twitter", re: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s"'<>]+/i },
  { label: "YouTube", re: /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/i },
  { label: "Substack", re: /https?:\/\/[^\s"'<>]*substack\.com\/[^\s"'<>]*/i },
  { label: "Medium", re: /https?:\/\/(?:[a-z0-9-]+\.)?medium\.com\/[^\s"'<>]+/i },
];

// Detected social links advertised ON the site (label + first URL each).
export function extractSocialLinks(html: string): Array<{ label: string; url: string }> {
  const out: Array<{ label: string; url: string }> = [];
  for (const { label, re } of SOCIAL_PATTERNS) {
    const m = html.match(re);
    if (m) out.push({ label, url: m[0].replace(/["'<>].*$/, "") });
  }
  return out;
}

// Build the prompt facts + citations + raw payload from one or more fetched
// pages' HTML. Pure so it's unit-testable without the network.
export function websiteFacts(
  websiteUrl: string,
  pages: Array<{ url: string; html: string }>,
): { facts: string[]; citations: string[]; raw: Record<string, unknown> } {
  const facts: string[] = [];
  const citations: string[] = [websiteUrl];
  const home = pages[0]?.html ?? "";
  const combined = pages.map((p) => p.html).join("\n");

  const host = hostOf(websiteUrl);
  const title = extractTitle(home);
  const description = extractMetaDescription(home);
  const headings = extractHeadings(combined, 5);
  const snippet = extractVisibleSnippet(home, 300);
  const socials = extractSocialLinks(combined);

  facts.push(`Personal website: ${host} (${websiteUrl}).`);
  if (title) facts.push(`Site title: "${title}".`);
  if (description) facts.push(`Site description: "${description}".`);
  if (headings.length) facts.push(`Top headings: ${headings.map((h) => `"${h}"`).join(", ")}.`);
  if (snippet && !description) facts.push(`Homepage text: "${snippet}".`);
  if (socials.length) {
    facts.push(`Social links on site: ${socials.map((s) => `${s.label} (${s.url})`).join(", ")}.`);
    for (const s of socials) citations.push(s.url);
  }

  return {
    facts,
    citations: [...new Set(citations)],
    raw: {
      websiteUrl,
      host,
      title,
      description,
      headings,
      snippet,
      socials,
      pages_fetched: pages.map((p) => p.url),
    },
  };
}

export async function enrichWithWebsite(ctx: EnricherContext): Promise<EnrichmentResult> {
  const noData = (note: string): EnrichmentResult => ({
    source: "website",
    status: "no_data",
    note,
    facts: [],
    citations: [],
  });

  const websiteUrl = pickWebsiteUrl(ctx.websiteUrl, candidateUrlsFromContext(ctx));
  if (!websiteUrl) return noData("no website URL");

  try {
    // Homepage first; then best-effort /about (most "who is this" signal lives
    // there). Both bounded; a missing /about is fine.
    const homeHtml = await fetchHtml(websiteUrl);
    if (!homeHtml) return noData("homepage not fetchable");

    const pages: Array<{ url: string; html: string }> = [{ url: websiteUrl, html: homeHtml }];
    let aboutUrl: string | null = null;
    try {
      aboutUrl = new URL("/about", websiteUrl).toString();
    } catch {
      aboutUrl = null;
    }
    if (aboutUrl && aboutUrl !== websiteUrl) {
      const aboutHtml = await fetchHtml(aboutUrl).catch(() => null);
      if (aboutHtml) pages.push({ url: aboutUrl, html: aboutHtml });
    }

    const { facts, citations, raw } = websiteFacts(websiteUrl, pages);
    // Only the host line + nothing else means we extracted nothing useful.
    if (facts.length <= 1) return noData("no usable content");

    return { source: "website", status: "ok", facts, citations, raw };
  } catch (err) {
    return {
      source: "website",
      status: "error",
      note: err instanceof Error ? err.message : "fetch error",
      facts: [],
      citations: [],
      raw: { websiteUrl, error: String(err) },
    };
  }
}
