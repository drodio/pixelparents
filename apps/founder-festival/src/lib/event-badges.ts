// Pure data-assembly for the event-badge print route. The route does the I/O
// (DB reads, radar computation, QR generation); this module shapes each
// attendee's row into what a badge renders, so it's unit-testable in isolation.

import type { CredibilityRadars, RadarVector } from "./credibility";
import { profileUrlFor } from "./profile-slug";
import { companyNameFromDomain } from "./identity";

export type BadgeDimension = "founder" | "investor";

export type BadgeData = {
  name: string;
  company: string | null;
  profileUrl: string; // absolute (for the QR code)
  dimension: BadgeDimension;
  vectors: RadarVector[];
};

// The subset of an evaluations row a badge needs.
export type BadgeEval = {
  id: string;
  fullName: string | null;
  founderScore: number | null;
  investorScore: number | null;
  slug: string | null;
  slugKind: string | null;
  profile: unknown;
};

type ProfileBlob = {
  primaryCompanyDomain?: string | null;
  extractedMetrics?: { partnerAtFirm?: string | null } | null;
  identity?: { companyName?: string | null } | null;
};

// Which radar to show: the profile's canonical role (slugKind) when set,
// otherwise the higher-scoring dimension, defaulting to founder.
export function pickBadgeDimension(ev: Pick<BadgeEval, "slugKind" | "founderScore" | "investorScore">): BadgeDimension {
  if (ev.slugKind === "founder" || ev.slugKind === "investor") return ev.slugKind;
  const f = ev.founderScore ?? 0;
  const i = ev.investorScore ?? 0;
  return i > f ? "investor" : "founder";
}

// Same company-name preference as the leaderboard / profiles list: clean
// identity name → VC firm → capitalized domain.
export function badgeCompanyName(profile: unknown): string | null {
  const p = (profile as ProfileBlob | null) ?? null;
  return (
    p?.identity?.companyName?.trim() ||
    p?.extractedMetrics?.partnerAtFirm?.trim() ||
    companyNameFromDomain(p?.primaryCompanyDomain)
  );
}

// Radar geometry, factored out of the SVG component so it's unit-testable.
// Vertex `i` of `count` sits at angle (i/count * 360 - 90)° (first axis points
// straight up), at radius `frac * R` from (cx, cy).
export function radarVertex(
  frac: number,
  i: number,
  count: number,
  R: number,
  cx: number,
  cy: number,
): [number, number] {
  const a = ((i * 360) / count - 90) * (Math.PI / 180);
  return [cx + frac * R * Math.cos(a), cy + frac * R * Math.sin(a)];
}

// SVG `points` string for a ring at `frac` of the radius (frac=1 is the outer
// edge), or for a polygon whose per-axis radii come from `fracs`.
export function radarRing(count: number, frac: number, R: number, cx: number, cy: number): string {
  return Array.from({ length: count }, (_, i) => radarVertex(frac, i, count, R, cx, cy).join(",")).join(" ");
}
export function radarShape(fracs: number[], R: number, cx: number, cy: number): string {
  return fracs.map((f, i) => radarVertex(f, i, fracs.length, R, cx, cy).join(",")).join(" ");
}

export function buildBadgeData(opts: {
  applicantFullName: string | null;
  ev: BadgeEval;
  radars: CredibilityRadars;
  siteUrl: string;
}): BadgeData {
  const { applicantFullName, ev, radars, siteUrl } = opts;
  const name = (applicantFullName ?? ev.fullName ?? "").trim() || "Guest";
  const dimension = pickBadgeDimension(ev);
  const path = profileUrlFor({ evalId: ev.id, slug: ev.slug, slugKind: ev.slugKind });
  const profileUrl = `${siteUrl.replace(/\/+$/, "")}${path}`;
  return {
    name,
    company: badgeCompanyName(ev.profile),
    profileUrl,
    dimension,
    vectors: radars[dimension],
  };
}
