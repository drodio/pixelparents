// Single source of truth for the signup form's choice options.
// Used by both the form UI and the Zod validation schema.

export const OHS_AFFILIATIONS = [
  "New parent (child(ren) just starting at OHS)",
  "Existing parent (child(ren) currently enrolled at OHS)",
  "Previous parent (child(ren) have graduated from OHS)",
  "Alumni student (I graduated from OHS)",
] as const;

export const TECHNICAL_DEPTH = [
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
  "<1 hour /week",
  "1-2 hours/week",
  "2-5 hours/week",
  "5-10 hours/week",
  "10-20 hours/week",
  "Full time or more!",
] as const;

export const GRADES = ["7th", "8th", "9th", "10th", "11th"] as const;

export type OhsAffiliation = (typeof OHS_AFFILIATIONS)[number];
export type TechnicalDepth = (typeof TECHNICAL_DEPTH)[number];
export type Skillset = (typeof SKILLSETS)[number];
export type TimeCommitment = (typeof TIME_COMMITMENT)[number];
export type Grade = (typeof GRADES)[number];
