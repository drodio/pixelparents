// Canonical option taxonomies for Pixel Parents — single source of truth shared
// by the signup form (long, user-facing labels) and the developer API's
// /api/v1/options endpoint. Non-PII reference data, safe to publish.

export const OHS_AFFILIATIONS = [
  "New parent (child(ren) just starting at OHS)",
  "Existing parent (child(ren) currently enrolled at OHS)",
  "Previous parent (child(ren) have graduated from OHS)",
  "Alumni student (I graduated from OHS)",
] as const;
// Alias used by the developer API (kept in sync — same underlying list).
export const AFFILIATIONS = OHS_AFFILIATIONS;

export const TECHNICAL_DEPTH = [
  "Yegge or Linus Level",
  "10x Developer",
  "Rusty, but good!",
  "Junior Developer",
  "Vibe coder",
  "Future vibe coder (just curious)",
] as const;
export const TECH_DEPTH = TECHNICAL_DEPTH;

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
  "<1 hour /week",
  "1-2 hours/week",
  "2-5 hours/week",
  "5-10 hours/week",
  "10-20 hours/week",
  "Full time or more!",
] as const;

export const GRADES = [
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "Not an OHS child",
] as const;

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

// Full non-PII option surface returned by GET /api/v1/options.
export const OPTIONS = {
  affiliations: OHS_AFFILIATIONS,
  tech_depth: TECHNICAL_DEPTH,
  skillsets: SKILLSETS,
  time_commitment: TIME_COMMITMENT,
  grades: GRADES,
} as const;

export type OhsAffiliation = (typeof OHS_AFFILIATIONS)[number];
export type TechnicalDepth = (typeof TECHNICAL_DEPTH)[number];
export type Skillset = (typeof SKILLSETS)[number];
export type TimeCommitment = (typeof TIME_COMMITMENT)[number];
export type Grade = (typeof GRADES)[number];
