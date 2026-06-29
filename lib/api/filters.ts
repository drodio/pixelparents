import {
  US_STATES,
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  TIME_COMMITMENT,
  SKILLSETS,
  GRADES,
  BUILDER_INTEREST,
  STATE_ABBR,
} from "@/lib/options";
import type { Filters } from "@/lib/db/aggregates";

// Reverse map: USPS abbr -> full state name, so `?state=CA` and `?state=California`
// both work (the column stores full names).
const ABBR_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBR).map(([name, abbr]) => [abbr, name]),
);

// Validate query params against the canonical taxonomies. Unknown values are
// rejected (caller returns 400) rather than silently ignored, so a typo'd filter
// never quietly returns the whole population.
export function parseFilters(params: URLSearchParams): { filters: Filters; errors: string[] } {
  const errors: string[] = [];
  const filters: Filters = {};

  const stateRaw = params.get("state");
  if (stateRaw != null) {
    const full = (US_STATES as readonly string[]).includes(stateRaw)
      ? stateRaw
      : ABBR_TO_STATE[stateRaw.toUpperCase()];
    if (full) filters.state = full;
    else errors.push(`invalid state: "${stateRaw}"`);
  }

  const checks: Array<[keyof Filters, readonly string[], string]> = [
    ["affiliation", OHS_AFFILIATIONS, "affiliation"],
    ["tech_depth", TECHNICAL_DEPTH, "tech_depth"],
    ["time_commitment", TIME_COMMITMENT, "time_commitment"],
    ["skillset", SKILLSETS, "skillset"],
    ["grade", GRADES, "grade"],
    ["builder_interest", BUILDER_INTEREST, "builder_interest"],
  ];
  for (const [key, allowed, qp] of checks) {
    const v = params.get(qp);
    if (v == null) continue;
    if ((allowed as readonly string[]).includes(v)) filters[key] = v;
    else errors.push(`invalid ${qp}: "${v}"`);
  }

  return { filters, errors };
}
