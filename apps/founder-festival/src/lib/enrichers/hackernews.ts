import type { EnricherContext, EnrichmentResult } from "./types";
import { deriveHandleCandidates, handleFromUrls, nameTokens, textCorroborates } from "./identity";
import { domainHost } from "@/lib/domain-normalize";

// Hacker News — two free, no-auth APIs:
//   • Firebase   https://hacker-news.firebaseio.com/v0/user/<id>.json
//       → { karma, created, about } — karma is the net upvotes across ALL of
//         a user's stories + comments combined (the single best summary).
//   • Algolia    https://hn.algolia.com/api/v1/search?tags=author_<id>,story
//       → exact story/comment counts + per-STORY points (upvotes). Note: HN
//         deliberately hides per-COMMENT scores, so comment `points` is null.
//
// Matching: HN has no name->user lookup and usernames are arbitrary (verified:
// the handle `jordan` has 113 karma and an empty bio — NOT the well-known
// investor of the same name). So
// we trust a handle only when (a) Exa already surfaced a HN profile URL for the
// subject, or (b) a derived candidate's bio corroborates their identity.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const FIREBASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA = "https://hn.algolia.com/api/v1";

type HnUser = { id: string; karma?: number; created?: number; about?: string };
type AlgoliaHit = { objectID: string; title?: string | null; points?: number | null; num_comments?: number | null; comment_text?: string | null };
type AlgoliaResp = { nbHits: number; hits: AlgoliaHit[] };

// Derive launch + virality facts from a user's HN stories. A "Show HN" post is a
// PRODUCT-LAUNCH event (stronger than commenting); a story scoring 100+ points was
// almost certainly FRONT-PAGED (a reach/virality signal). Pure — unit-testable.
export function hnLaunchFacts(allStories: AlgoliaHit[]): string[] {
  const stories = (allStories ?? []).filter((h) => h.title);
  const showHn = stories.filter((h) => /^show hn[:\s]/i.test(h.title ?? ""));
  const showHnStrong = showHn.filter((h) => (h.points ?? 0) >= 50).length;
  const frontPage = stories.filter((h) => (h.points ?? 0) > 100).length;
  const out: string[] = [];
  if (showHn.length > 0) {
    const topShow = showHn.slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
    out.push(
      `${showHn.length} "Show HN" launch post(s)${showHnStrong ? `, ${showHnStrong} with 50+ points` : ""} — Show HN is a PRODUCT-LAUNCH event (builder signal). Top: "${topShow?.title}" (${topShow?.points ?? 0} pts).`,
    );
  }
  if (frontPage > 0) {
    out.push(
      `${frontPage} HN post(s) scored 100+ points — very likely FRONT-PAGED (virality/reach, beyond mere participation).`,
    );
  }
  return out;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fetchUser(id: string): Promise<HnUser | null> {
  return fetchJson<HnUser>(`${FIREBASE}/user/${encodeURIComponent(id)}.json`);
}

// HN `about` fields are HTML with <a> tags / entities; flatten to plain text.
function stripHtml(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Registrable-ish domain of a URL (strip scheme/path/www). Null for junk.
export function registrableDomain(url: string): string | null {
  try {
    const host = domainHost(url);
    return /\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

// Big platforms where "the author of a story linking here" is NOT evidence the
// linker is the subject — exclude them from content-discovery domain seeds.
const DISCOVERY_DENY = /(?:^|\.)(?:linkedin|twitter|x|facebook|instagram|github|medium|substack|youtube|crunchbase|wikipedia|news\.ycombinator|reddit|google|apple|amazon|microsoft|notion|techcrunch|forbes|bloomberg|nytimes)\.[a-z]+$/i;

// The subject's OWN domains, inferred from the Exa highlights Exa surfaced about
// them (their blog, personal site, company), minus the big-platform denylist.
// These seed the content-discovery search below.
export function subjectDomainsFromHighlights(ctx: EnricherContext, max = 4): string[] {
  const freq = new Map<string, number>();
  for (const h of ctx.searchHighlights ?? []) {
    const d = registrableDomain(h.url);
    if (!d || DISCOVERY_DENY.test(d)) continue;
    freq.set(d, (freq.get(d) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, max);
}

// Discover a HN handle by CONTENT, not by guessing: HN usernames are
// case-sensitive and arbitrary (Samuel Rivera is "Sam_Rivera"), so name-derivation
// misses them. Instead, search HN for STORIES whose URL points at the subject's
// own domains — people submit their own work — collect the authors, and accept
// the most-frequent one whose HN bio corroborates the subject's identity. This
// returns the EXACT-case handle straight from the API.
async function discoverHnHandleByContent(
  ctx: EnricherContext,
  knownHnUrls: string[],
): Promise<{ handle: string; user: HnUser } | null> {
  const domains = subjectDomainsFromHighlights(ctx);
  if (domains.length === 0) return null;
  const authorCounts = new Map<string, number>();
  await Promise.all(
    domains.map(async (d) => {
      const resp = await fetchJson<{ hits?: Array<{ author?: string }> }>(
        `${ALGOLIA}/search?query=${encodeURIComponent(d)}&restrictSearchableAttributes=url&tags=story&hitsPerPage=20`,
      );
      for (const hit of resp?.hits ?? []) {
        if (hit.author) authorCounts.set(hit.author, (authorCounts.get(hit.author) ?? 0) + 1);
      }
    }),
  );
  const ranked = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  // Fetch the candidate authors' profiles in PARALLEL, then accept the first (in
  // rank order) whose bio corroborates — one round-trip instead of up to five.
  const users = await Promise.all(ranked.map(([author]) => fetchUser(author)));
  for (const u of users) {
    if (u?.id && textCorroborates(ctx, stripHtml(u.about), knownHnUrls)) {
      return { handle: u.id, user: u };
    }
  }
  return null;
}

// Split a handle into name-ish tokens: "Sam_Rivera" → ["sam","rivera"], "DROdio"
// → ["dr","odio"] (camelCase). Used for the prefix-tolerant name match below.
export function handleNameTokens(h: string): string[] {
  return h
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.\d]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2);
}

// Loose name match for handle-derived names: the LAST name must match exactly,
// the FIRST name only needs to be prefix-compatible — so "Samuel Lee" matches
// a handle "Sam_Lee" (sam ⊂ samuel), but not an unrelated "Sam Rivera".
export function looseNameMatch(subject: string[], entry: string[]): boolean {
  if (subject.length < 2 || entry.length < 2) return false;
  const sLast = subject[subject.length - 1]!;
  const eLast = entry[entry.length - 1]!;
  if (sLast.length < 3 || eLast !== sLast) return false;
  const s0 = subject[0]!;
  const e0 = entry[0]!;
  return s0.length >= 3 && e0.length >= 3 && (s0.startsWith(e0) || e0.startsWith(s0));
}

const TKMX_USERS_URL = "https://tkmx.odio.dev/api/users";
type TkmxUserLite = { username?: string; hn_username?: string };

// Tier 4: the subject is on the HN Tokenmaxxing leaderboard, which carries each
// member's `hn_username`. Match the subject to a tkmx entry by a known handle OR
// a prefix-tolerant name match ("Samuel Rivera" ↔ hn_username "Sam_Rivera"), then
// confirm that hn_username against HN with bio corroboration. This catches
// arbitrary HN handles that content-discovery misses when the subject's own
// domain isn't in the Exa highlights (exactly Sam Odio's case).
async function tkmxIdentityHandle(
  ctx: EnricherContext,
  knownHnUrls: string[],
): Promise<{ handle: string; user: HnUser } | null> {
  const resp = await fetchJson<{ users?: TkmxUserLite[] }>(TKMX_USERS_URL);
  const users = resp?.users;
  if (!users?.length) return null;
  const subjectTokens = nameTokens(ctx.fullName);
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const knownHandles = new Set(
    [ctx.linkedinHandle, ...deriveHandleCandidates(ctx)].filter(Boolean).map((h) => norm(h!)),
  );
  for (const u of users) {
    const hn = u.hn_username?.trim();
    if (!hn) continue;
    const fields = [u.hn_username, u.username].filter(Boolean) as string[];
    const handleHit = fields.some((f) => knownHandles.has(norm(f)));
    const nameHit = fields.some((f) => looseNameMatch(subjectTokens, handleNameTokens(f)));
    if (!handleHit && !nameHit) continue;
    const user = await fetchUser(hn);
    if (user?.id && textCorroborates(ctx, stripHtml(user.about), knownHnUrls)) {
      return { handle: hn, user };
    }
  }
  return null;
}

// Resolve the subject's HN handle via four tiers of increasing effort:
//   1. exa-url  — a HN profile URL Exa already tied to the subject (trusted).
//   2. bio      — a name/linkedin-derived candidate whose bio corroborates.
//   3. content  — the bio-corroborated author of stories linking the subject's
//                 own domains.
//   4. tkmx     — a bio-corroborated tkmx-leaderboard entry's hn_username
//                 (catches arbitrary handles like "Sam_Rivera" whose owner's
//                 domain isn't in the highlights).
// Shared so BOTH the HN enricher and the HN-Tokenmaxxing enricher resolve the
// same handle (Tokenmaxxing used to only read Exa URLs, so it silently missed
// anyone — like Sam Odio — whose HN URL wasn't surfaced by Exa).
export async function resolveHnHandle(
  ctx: EnricherContext,
  knownHnUrls: string[],
): Promise<{ handle: string; user: HnUser; via: "exa-url" | "bio" | "content" | "tkmx" } | null> {
  const fromUrl = handleFromUrls(knownHnUrls, /news\.ycombinator\.com\/user\?id=([A-Za-z0-9_-]+)/i);
  if (fromUrl) {
    const u = await fetchUser(fromUrl);
    if (u) return { handle: fromUrl, user: u, via: "exa-url" };
  }
  // Probe all derived candidate handles in PARALLEL (was up to 6 sequential
  // round-trips — a meaningful chunk of the latency that pushed heavy profiles
  // past the function timeout), then accept the first that corroborates.
  const candidates = deriveHandleCandidates(ctx);
  const candUsers = await Promise.all(candidates.map((c) => fetchUser(c)));
  for (let i = 0; i < candidates.length; i++) {
    const u = candUsers[i];
    if (u?.id && textCorroborates(ctx, stripHtml(u.about), knownHnUrls)) {
      return { handle: candidates[i]!, user: u, via: "bio" };
    }
  }
  const discovered = await discoverHnHandleByContent(ctx, knownHnUrls);
  if (discovered) return { ...discovered, via: "content" };
  const tkmx = await tkmxIdentityHandle(ctx, knownHnUrls);
  if (tkmx) return { ...tkmx, via: "tkmx" };
  return null;
}

export async function enrichWithHackerNews(
  ctx: EnricherContext,
  knownHnUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "hackernews", facts: [], citations: [] };

  const resolved = await resolveHnHandle(ctx, knownHnUrls);
  if (!resolved) return empty;
  const { handle, user, via: confirmedVia } = resolved;

  const facts: string[] = [];
  const karma = user.karma ?? 0;
  const ageYears = user.created
    ? Math.floor((Date.now() / 1000 - user.created) / (365 * 86400))
    : null;
  const sinceYear = user.created ? new Date(user.created * 1000).getFullYear() : null;

  facts.push(
    `Hacker News: @${handle} — ${karma.toLocaleString("en-US")} karma` +
      (ageYears != null ? `, account ~${ageYears}y old (since ${sinceYear})` : "") +
      ".",
  );

  // Counts (nbHits) + a CONTENT sample: top posts (by points) and a handful of
  // their longest recent comments, so the model can assess INDIVIDUAL technical
  // depth / domain expertise from what they actually write — not just karma.
  const [storyResp, commentResp] = await Promise.all([
    fetchJson<AlgoliaResp>(`${ALGOLIA}/search?tags=author_${encodeURIComponent(handle)},story&hitsPerPage=100`),
    fetchJson<AlgoliaResp>(`${ALGOLIA}/search?tags=author_${encodeURIComponent(handle)},comment&hitsPerPage=20`),
  ]);
  const storyCount = storyResp?.nbHits ?? 0;
  const commentCount = commentResp?.nbHits ?? 0;
  if (storyCount > 0 || commentCount > 0) {
    facts.push(`${storyCount.toLocaleString("en-US")} posts / ${commentCount.toLocaleString("en-US")} comments on HN.`);
  }

  // Top posts by upvotes (stories expose `points`; sort client-side).
  const topPosts = (storyResp?.hits ?? [])
    .filter((h) => (h.points ?? 0) > 0 && h.title)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 3);
  for (const p of topPosts) {
    facts.push(
      `  • "${p.title}" — ${p.points} points${p.num_comments ? `, ${p.num_comments} comments` : ""}.`,
    );
  }

  // Show HN launches + front-page virality, derived from the stories already
  // fetched (no extra API call).
  for (const f of hnLaunchFacts(storyResp?.hits ?? [])) facts.push(f);

  // CONTENT sample for individual-depth assessment: their longest substantive
  // comments (HN hides comment scores, so we can't rank by upvotes — length is a
  // decent proxy for substance). The model reads these to judge what THEY
  // personally know/do, and which topics/industries they engage with.
  const commentSamples = (commentResp?.hits ?? [])
    .map((c) => stripHtml(c.comment_text ?? ""))
    .filter((t) => t.length >= 80)
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .map((t) => (t.length > 280 ? t.slice(0, 279).trimEnd() + "…" : t));
  if (commentSamples.length > 0) {
    facts.push("Sample of their HN comments (assess individual technical depth / domain / interests from CONTENT, not karma):");
    for (const c of commentSamples) facts.push(`  – "${c}"`);
  }

  const about = stripHtml(user.about);
  if (about) facts.push(`HN bio: "${about.slice(0, 200)}".`);

  return {
    source: "hackernews",
    facts,
    citations: [`https://news.ycombinator.com/user?id=${handle}`],
    raw: {
      handle,
      confirmed_via: confirmedVia,
      karma,
      account_age_years: ageYears,
      story_count: storyCount,
      comment_count: commentCount,
      // Linkable HN URLs so score rows can deep-link to the source (see
      // addHnCitations in eval-pipeline): the user's profile, their submissions
      // feed, and each top post's HN item page (via the Algolia objectID).
      profile_url: `https://news.ycombinator.com/user?id=${handle}`,
      submitted_url: `https://news.ycombinator.com/submitted?id=${handle}`,
      top_posts: topPosts.map((p) => ({
        title: p.title,
        points: p.points,
        item_url: `https://news.ycombinator.com/item?id=${p.objectID}`,
      })),
    },
  };
}
