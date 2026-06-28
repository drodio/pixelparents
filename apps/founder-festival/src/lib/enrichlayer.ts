// EnrichLayer (formerly Proxycurl) — structured LinkedIn data via a real API
// (no scraping). Used as a FALLBACK in researchLinkedinProfile: it fires ONLY when
// Exa's LinkedIn content fetch comes back empty, so we pay the per-call cost (~$0.10)
// only on the profiles that actually need it. It cannot read a profile the user has
// set to PRIVATE (returns 404 "marked as private") — no public-data API can; that's
// the one case this doesn't rescue. No-ops gracefully without ENRICHLAYER_API_KEY.

const BASE = "https://enrichlayer.com/api/v2/profile";

type ElExperience = { title?: string; company?: string; description?: string; starts_at?: { year?: number } | null; ends_at?: { year?: number } | null };
type ElEducation = { degree_name?: string; field_of_study?: string; school?: string };
type ElAward = { title?: string; issuer?: string };
export type ElProfile = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  occupation?: string;
  summary?: string;
  industry?: string;
  location_str?: string;
  city?: string;
  country_full_name?: string;
  follower_count?: number;
  experiences?: ElExperience[];
  education?: ElEducation[];
  accomplishment_honors_awards?: ElAward[];
};

// Build a readable text blob from the structured profile, shaped like the LinkedIn
// page text the rest of the pipeline expects (name first, then roles). Pure +
// exported for tests.
export function buildProfileText(p: ElProfile): string {
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ");
  const lines: string[] = [];
  if (name) lines.push(name);
  if (p.headline) lines.push(p.headline);
  if (p.occupation && p.occupation !== p.headline) lines.push(p.occupation);
  const loc = p.location_str || [p.city, p.country_full_name].filter(Boolean).join(", ");
  if (loc) lines.push(loc);
  if (p.industry) lines.push(`Industry: ${p.industry}`);
  if (typeof p.follower_count === "number" && p.follower_count > 0) lines.push(`${p.follower_count.toLocaleString("en-US")} LinkedIn followers`);
  if (p.summary) lines.push(`About: ${p.summary}`);
  if (p.experiences?.length) {
    lines.push("Experience:");
    for (const e of p.experiences.slice(0, 12)) {
      const role = [e.title, e.company].filter(Boolean).join(" at ");
      if (!role) continue;
      const yr = e.starts_at?.year ? ` (${e.starts_at.year}${e.ends_at?.year ? `–${e.ends_at.year}` : "–present"})` : "";
      const desc = e.description ? ` — ${e.description.replace(/\s+/g, " ").slice(0, 160)}` : "";
      lines.push(`- ${role}${yr}${desc}`);
    }
  }
  if (p.education?.length) {
    lines.push("Education:");
    for (const ed of p.education.slice(0, 6)) {
      const t = [ed.degree_name, ed.field_of_study, ed.school].filter(Boolean).join(", ");
      if (t) lines.push(`- ${t}`);
    }
  }
  const awards = (p.accomplishment_honors_awards ?? []).map((a) => [a.title, a.issuer].filter(Boolean).join(" — ")).filter(Boolean);
  if (awards.length) lines.push(`Honors/Awards: ${awards.slice(0, 8).join("; ")}`);
  return lines.join("\n").trim();
}

// Returns the profile text (+ raw) or null on: no key, HTTP error, private/404, or
// an unusable (textless) response. Never throws.
export async function fetchEnrichLayerProfileText(linkedinUrl: string): Promise<{ text: string; raw: unknown } | null> {
  const token = process.env.ENRICHLAYER_API_KEY;
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}?url=${encodeURIComponent(linkedinUrl)}&use_cache=if-present`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (!res.ok) return null;
    const p = (await res.json()) as ElProfile;
    const text = buildProfileText(p);
    return text ? { text, raw: p } : null;
  } catch {
    return null;
  }
}
