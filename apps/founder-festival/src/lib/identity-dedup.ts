import { nameMatches } from "./name-match";

// Identity-based duplicate detection. festival.so used to dedup profiles ONLY on
// the resolved LinkedIn URL, so the SAME person arriving via two different
// LinkedIn URLs (e.g. linkedin.com/in/mxstbr vs .../max-stoiber-46698678) created
// two profiles. This adds a second, person-level key: same GitHub username.
//
// GitHub username alone is NOT safe — it gets mis-attached (one GitHub wrongly on
// several different people). So we only treat two rows as the same person when
// github username + name + (website OR company) all corroborate — the "Max
// Stoiber test." That merges the real duplicate but refuses to merge the
// mis-attach cases (different people whose company/website differ).

export type PersonIdentity = {
  githubUsername: string | null;
  fullName: string | null;
  website: string | null; // normalized (no protocol/www/trailing slash)
  company: string | null; // lowercased
};

export function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return v || null;
}

// Pull a PersonIdentity from a row's `fullName` column + its `profile.identity`
// JSON (shape built by buildIdentity: { github:{username}, websiteUrl, companyName }).
export function personIdentityFromProfile(
  fullName: string | null | undefined,
  identity: unknown,
): PersonIdentity {
  const id = (identity ?? {}) as {
    github?: { username?: string | null } | null;
    websiteUrl?: string | null;
    companyName?: string | null;
  };
  const gh = id.github?.username ? String(id.github.username).trim().toLowerCase() : null;
  const company = id.companyName ? String(id.companyName).trim().toLowerCase() : null;
  return {
    githubUsername: gh || null,
    fullName: fullName ?? null,
    website: normalizeWebsite(id.websiteUrl),
    company: company || null,
  };
}

// Web hosts that many DIFFERENT people list as "their website" — a shared host
// is NOT identifying, so it can't be the sole corroborator for a GitHub-less
// merge. A dedicated personal/company domain (uefo.pro, stripe.com) is.
const GENERIC_WEB_HOSTS = new Set([
  "linkedin.com", "github.com", "twitter.com", "x.com", "facebook.com",
  "instagram.com", "medium.com", "substack.com", "notion.so", "notion.site",
  "youtube.com", "about.me", "linktr.ee", "google.com", "sites.google.com",
  "wordpress.com", "wixsite.com", "carrd.co", "bento.me", "beacons.ai",
  "gmail.com", "calendly.com", "tiktok.com", "threads.net",
]);

// The non-generic host of a normalized website, or null when absent/generic.
// Used both as the dedup corroborator and to fetch candidates by domain.
export function dedupWebsiteDomain(website: string | null | undefined): string | null {
  const w = normalizeWebsite(website ?? null);
  if (!w) return null;
  const host = w.split("/")[0]!;
  return GENERIC_WEB_HOSTS.has(host) ? null : host;
}

// Same person WITHOUT a GitHub username: identical NAME + the SAME dedicated
// (non-generic) website. For founders with no resolved GitHub who arrive via a
// second LinkedIn URL — a custom vanity vs LinkedIn's default (e.g.
// /in/ojuwaifo vs /in/joshua-uwaifo-9239989a) — the personal/company domain is
// the strong corroborator. Conservative: a generic/social website never counts.
export function isSamePersonByWebsite(a: PersonIdentity, b: PersonIdentity): boolean {
  if (!a.fullName || !b.fullName || !nameMatches(a.fullName, b.fullName)) return false;
  const da = dedupWebsiteDomain(a.website);
  const db = dedupWebsiteDomain(b.website);
  return !!da && da === db;
}

// True only when we're confident a and b are the SAME person: identical GitHub
// username AND the names corroborate AND at least one of website/company
// corroborates. Conservative on purpose — a missed merge just leaves a visible
// duplicate; a wrong merge would fuse two real people.
export function isSamePerson(a: PersonIdentity, b: PersonIdentity): boolean {
  if (!a.githubUsername || !b.githubUsername) return false;
  if (a.githubUsername !== b.githubUsername) return false;
  // Names must both be present and corroborate (guards github mis-attach to a
  // different-named person). nameMatches is lenient on missing names, so require
  // both present explicitly.
  if (!a.fullName || !b.fullName) return false;
  if (!nameMatches(a.fullName, b.fullName)) return false;
  // Need an independent corroborator so two same-named people (same mis-attached
  // github) don't merge.
  const websiteHit = !!a.website && !!b.website && a.website === b.website;
  const companyHit = !!a.company && !!b.company && a.company === b.company;
  return websiteHit || companyHit;
}
