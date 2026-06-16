// Canonical option taxonomies for the Pixel Parents signup. Single source of
// truth, shared by the signup form (when it lands) and the developer API's
// /api/v1/options endpoint. These are non-PII reference data — safe to publish.
//
// NOTE (coordination): the in-flight /signup feature also needs these constants.
// When that work merges, this file is the intended shared home — reconcile any
// divergence here rather than duplicating the lists.

export const AFFILIATIONS = [
  "New parent (child(ren) just starting at OHS)",
  "Existing parent (currently enrolled)",
  "Previous parent (graduated)",
  "Alumni student (I graduated from OHS)",
] as const;

export const TECH_DEPTH = [
  "Yegge or Linus Level",
  "10x Developer",
  "Rusty, but good!",
  "Junior Developer",
  "Vibe coder",
  "Future vibe coder (just curious)",
] as const;

export const SKILLSETS = [
  "Backend",
  "Frontend",
  "Fullstack",
  "Eng manager",
  "DevOps",
  "AI LLM Wrangler",
  "Security",
  "Analytics",
] as const;

export const TIME_COMMITMENT = [
  "<1 hour/week",
  "1–2 hours/week",
  "2–5 hours/week",
  "5–10 hours/week",
  "10–20 hours/week",
  "Full time or more!",
] as const;

export const GRADES = ["7th", "8th", "9th", "10th", "11th"] as const;

// The full non-PII option surface returned by GET /api/v1/options.
export const OPTIONS = {
  affiliations: AFFILIATIONS,
  tech_depth: TECH_DEPTH,
  skillsets: SKILLSETS,
  time_commitment: TIME_COMMITMENT,
  grades: GRADES,
} as const;
