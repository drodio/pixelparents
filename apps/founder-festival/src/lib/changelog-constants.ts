// DB-FREE shared constants for the changelog. Imported by client components
// (the filter bar / timeline) AND server code, so it must never import @/db.

export type ChangeType = "feature" | "enhancement" | "bug_fix";

export const CHANGE_TYPES: { slug: ChangeType; label: string }[] = [
  { slug: "feature", label: "Feature" },
  { slug: "enhancement", label: "Enhancement" },
  { slug: "bug_fix", label: "Bug Fix" },
];

// Tailwind classes per change type (the colored "what kind of change" badge).
export const CHANGE_TYPE_STYLE: Record<ChangeType, string> = {
  feature: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/30",
  enhancement: "bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/30",
  bug_fix: "bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/30",
};

export const CHANGE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CHANGE_TYPES.map((t) => [t.slug, t.label]),
);

// The category buckets. Slugs are stored in the DB; labels are shown in the UI.
export const CHANGELOG_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "scoring_rubric", label: "Scoring Rubric" },
  { slug: "profiles", label: "Profiles" },
  { slug: "leaderboard", label: "Leaderboard" },
  { slug: "events", label: "Events" },
  { slug: "admin", label: "Admin" },
  { slug: "api", label: "API" },
  { slug: "billing", label: "Billing" },
  { slug: "pipeline", label: "Pipeline" },
  { slug: "security", label: "Security" },
  { slug: "performance", label: "Performance" },
  { slug: "infrastructure", label: "Infrastructure" },
  { slug: "design", label: "Design" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CHANGELOG_CATEGORIES.map((c) => [c.slug, c.label]),
);

export function categoryLabel(slug: string): string {
  return CATEGORY_LABEL[slug] ?? slug;
}
