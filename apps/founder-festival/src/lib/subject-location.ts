import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

// The canonical SUBJECT location lives on evaluations.subject_* and is fed by
// three sources with a fixed precedence — a higher source is never overwritten
// by a lower one. See the design spec (2026-06-01-bulk-scoring-enrichment).
export type LocationSource = "claimer" | "operator" | "linkedin";
export const LOCATION_RANK: Record<LocationSource, number> = {
  linkedin: 1,
  operator: 2,
  claimer: 3,
};

export type SubjectLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  raw: string | null;
};

// Best-effort structure a free-text location string. Comma-split: 3+ parts →
// city / region / (last = country); 2 parts → city / country; 1 part → keep as
// `raw` only (e.g. "San Francisco Bay Area" has no clean split). ALWAYS returns
// `raw` = the original trimmed string (null when empty).
export function parseLocationDisplayName(input: string | null | undefined): SubjectLocation {
  const raw = (input ?? "").trim();
  if (!raw) return { city: null, region: null, country: null, raw: null };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { city: parts[0]!, region: parts[1]!, country: parts[parts.length - 1]!, raw };
  }
  if (parts.length === 2) {
    return { city: parts[0]!, region: null, country: parts[1]!, raw };
  }
  return { city: null, region: null, country: null, raw };
}

// Does a write from `incoming` win over the currently-stored `current` source?
export function shouldOverwriteLocation(
  current: LocationSource | null,
  incoming: LocationSource,
): boolean {
  if (current == null) return true;
  return LOCATION_RANK[incoming] >= LOCATION_RANK[current];
}

// Precedence-aware write of a subject location onto an evaluation. No-ops when a
// higher-precedence source already holds the location, or when there's nothing
// to write.
export async function writeSubjectLocation(
  evaluationId: string,
  loc: SubjectLocation,
  source: LocationSource,
): Promise<void> {
  if (!loc.city && !loc.region && !loc.country && !loc.raw) return;
  const [row] = await db
    .select({ src: evaluations.subjectLocationSource })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  const current = (row?.src ?? null) as LocationSource | null;
  if (!shouldOverwriteLocation(current, source)) return;
  await db
    .update(evaluations)
    .set({
      subjectCity: loc.city,
      subjectRegion: loc.region,
      subjectCountry: loc.country,
      subjectLocationRaw: loc.raw,
      subjectLocationSource: source,
    })
    .where(eq(evaluations.id, evaluationId));
}
