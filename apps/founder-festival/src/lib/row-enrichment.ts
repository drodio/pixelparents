import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { upsertProfileEmail } from "./profile-emails";
import {
  writeSubjectLocation,
  parseLocationDisplayName,
  type SubjectLocation,
} from "./subject-location";

// Enrichment fields carried from an input row (paste/CSV) into the pipeline.
export type EnrichInput = {
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  locationRaw?: string | null;
};

// Resolve the row's location to a SubjectLocation: structured columns win;
// otherwise best-effort split the free-text `locationRaw`.
export function toSubjectLocation(e: EnrichInput): SubjectLocation {
  if (e.city || e.region || e.country) {
    return {
      city: e.city ?? null,
      region: e.region ?? null,
      country: e.country ?? null,
      raw: [e.city, e.region, e.country].filter(Boolean).join(", ") || null,
    };
  }
  return parseLocationDisplayName(e.locationRaw);
}

// Apply an input row's enrichment to an evaluation: operator email → verified
// profile_emails row; location → subject_* (operator precedence). No-ops for
// fields the row didn't supply.
export async function applyRowEnrichment(
  evaluationId: string,
  e: EnrichInput,
  byAdmin: string | null,
): Promise<void> {
  if (e.email) {
    await upsertProfileEmail(evaluationId, e.email, "verified", "operator", byAdmin);
  }
  const loc = toSubjectLocation(e);
  if (loc.city || loc.region || loc.country || loc.raw) {
    await writeSubjectLocation(evaluationId, loc, "operator");
  }
  // Operator-provided phone + job title — set when supplied (latest CSV wins).
  const phone = e.phone?.trim() || null;
  const jobTitle = e.jobTitle?.trim() || null;
  if (phone || jobTitle) {
    await db
      .update(evaluations)
      .set({
        ...(phone ? { phone } : {}),
        ...(jobTitle ? { jobTitle } : {}),
      })
      .where(eq(evaluations.id, evaluationId));
  }
}
