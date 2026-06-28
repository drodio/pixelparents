// Per-eval Exa cost accounting.
//
// Exa bills per request: searches and per-page content fetches. We thread an
// `ExaUsage` accumulator out of every Exa call site (see exa.ts,
// find-linkedin-handle.ts, enrichers/exa-domain.ts) so the eval pipeline can
// persist the real cost on each evaluations row.
//
// ACTUAL cost is read from each Exa response's `costDollars.total` (the real
// amount Exa charged for that request) and passed into searchUsage/contentsUsage
// as `realCostUsd`. The published-price constants below are only a FALLBACK for
// responses that don't carry costDollars — they are an estimate, never the
// reported actual when a real figure is available.

export type ExaUsage = {
  searches: number;
  contentFetches: number;
  costUsd: number;
  // Tracks results requested beyond the 10 included in the base search price,
  // which carry a +$1/1k overage each.
  numResultsOver10: number;
};

export const EXA_PRICING = {
  searchUsd: 7 / 1000, // $7 / 1,000 requests (first 10 results included)
  extraResultUsd: 1 / 1000, // +$1 / 1,000 for each result beyond 10
  contentPageUsd: 1 / 1000, // $1 / 1,000 pages (getContents)
} as const;

export function emptyExaUsage(): ExaUsage {
  return { searches: 0, contentFetches: 0, costUsd: 0, numResultsOver10: 0 };
}

// Usage for a single Exa search returning up to `numResults` results.
//
// `realCostUsd` is the actual amount Exa charged for this request, read from
// the response's `costDollars.total`. When present it is used verbatim (the
// authoritative number); when absent (older API / response without cost) we
// fall back to the published-price estimate. A real cost of exactly 0 (e.g.
// free tier) is honored, not treated as missing.
export function searchUsage(numResults: number, realCostUsd?: number): ExaUsage {
  const over10 = Math.max(0, numResults - 10);
  return {
    searches: 1,
    contentFetches: 0,
    numResultsOver10: over10,
    costUsd:
      typeof realCostUsd === "number"
        ? realCostUsd
        : EXA_PRICING.searchUsd + over10 * EXA_PRICING.extraResultUsd,
  };
}

// Usage for a single getContents call fetching `pages` pages. `realCostUsd`
// behaves as in searchUsage.
export function contentsUsage(pages: number, realCostUsd?: number): ExaUsage {
  return {
    searches: 0,
    contentFetches: pages,
    numResultsOver10: 0,
    costUsd: typeof realCostUsd === "number" ? realCostUsd : pages * EXA_PRICING.contentPageUsd,
  };
}

export function addExaUsage(a: ExaUsage, b: ExaUsage): ExaUsage {
  return {
    searches: a.searches + b.searches,
    contentFetches: a.contentFetches + b.contentFetches,
    numResultsOver10: a.numResultsOver10 + b.numResultsOver10,
    costUsd: a.costUsd + b.costUsd,
  };
}

export function sumExaUsage(items: ExaUsage[]): ExaUsage {
  return items.reduce(addExaUsage, emptyExaUsage());
}
