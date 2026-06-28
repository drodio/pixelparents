// DB-free endorsement constants + visibility logic. Safe to import from client
// components (the compose form, the slider) without dragging `@/db` into the
// browser bundle. Server query code lives in `@/lib/endorsements`.

// Three visibility levels, ordered most → least visible.
export type Visibility = "public" | "members_only" | "private";

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Your answer will be public to anyone" },
  { value: "members_only", label: "Members Only", hint: "Only Festival members will see your answer" },
  { value: "private", label: "Private", hint: "Only you and Festival admins will see your answer" },
];

// Most → least visible. Index position is the "visibility rank".
const ORDER: Visibility[] = ["public", "members_only", "private"];

export function isVisibility(v: unknown): v is Visibility {
  return v === "public" || v === "members_only" || v === "private";
}

// The points allocation can never be MORE visible than the endorsement itself —
// so the allowed set is the endorsement's level and everything less visible.
export function allowedPointsVisibilities(endorsementVis: Visibility): Visibility[] {
  return ORDER.slice(ORDER.indexOf(endorsementVis));
}

// Clamp a chosen points visibility into the allowed set (falls back to the
// endorsement's own visibility, the most-visible allowed value).
export function clampPointsVisibility(pointsVis: Visibility, endorsementVis: Visibility): Visibility {
  const allowed = allowedPointsVisibilities(endorsementVis);
  return allowed.includes(pointsVis) ? pointsVis : endorsementVis;
}

// Can a viewer with this context see something at the given visibility?
// Author always sees their own; public is universal; members_only needs a
// claimed (member) viewer; private is author-only.
export function canViewAtVisibility(
  vis: Visibility,
  ctx: { isMember: boolean; isAuthor: boolean },
): boolean {
  if (ctx.isAuthor) return true;
  if (vis === "public") return true;
  if (vis === "members_only") return ctx.isMember;
  return false; // private
}

// Default placeholder for the endorsement compose box.
export function ENDORSE_PLACEHOLDER(firstName: string): string {
  return `Write an endorsement for ${firstName}. You can @mention their badges and other member names in your text, and make it as long or short as you'd like.`;
}
