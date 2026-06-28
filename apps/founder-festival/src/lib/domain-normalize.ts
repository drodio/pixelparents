// Single owner for extracting a normalized HOST from a domain-or-URL string,
// used as a comparison/dedup key. Previously this `.toLowerCase().replace(/^www\./)`
// (± protocol/path stripping) was re-implemented ~10 times with subtle drift, so
// the same company domain could hash differently across the MM-bonus, badges, and
// enricher paths and miss matches. Pure + dependency-free.
//
// Semantics: trim → lowercase → strip http(s):// → strip a single leading `www.`
// → drop path/query/fragment (everything from the first / ? #). Subdomains other
// than www are preserved (they're meaningful). Does NOT validate a TLD — callers
// that need that (registrableDomain) layer it on top.
//
// NOT for: brand-name display (companyNameFromDomain splits to a single label),
// full-URL keys that must keep the path (identity-dedup.normalizeWebsite), or
// LinkedIn canonicalization (canonicalize.ts) — those have distinct contracts.

export function domainHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]!
    .trim();
}

// Null-safe wrapper: null/undefined/blank → null, else the normalized host.
export function domainHostOrNull(input: string | null | undefined): string | null {
  if (!input) return null;
  return domainHost(input) || null;
}
