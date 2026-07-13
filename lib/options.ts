// Canonical option taxonomies for GoPixel — single source of truth shared
// by the signup form (long, user-facing labels) and the developer API's
// /api/v1/options endpoint. Non-PII reference data, safe to publish.

export const OHS_AFFILIATIONS = [
  "New parent (child(ren) just starting at OHS)",
  "Existing parent (child(ren) currently enrolled at OHS)",
  "Previous parent (child(ren) have graduated from OHS)",
  "Current OHS student (I'm currently enrolled at OHS)",
  "Alumni student (I graduated from OHS)",
] as const;
// Alias used by the developer API (kept in sync — same underlying list).
export const AFFILIATIONS = OHS_AFFILIATIONS;

// Interest in helping build GoPixel software (signup question). Stored in
// signups.extra.builderInterest.
export const BUILDER_INTEREST = ["builder", "aspiring", "no"] as const;

// Who is filling out the signup — GoPixel is the whole OHS community, so one of
// three member types: a "parent"/guardian (the default; stores NO accountType,
// matching every pre-existing row byte-for-byte), a "student" (a minor who must
// link a parent/guardian and whose contact is age-gated), or an "alum" (a
// graduated OHS student — an adult member, no parent-link and no age gate).
// Persisted in signups.extra.accountType.
export const ACCOUNT_TYPE = ["parent", "student", "alum"] as const;
export type AccountType = (typeof ACCOUNT_TYPE)[number];

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
  "<1hr/wk",
  "1-2hr/wk",
  "2-5hr/wk",
  "5-10hr/wk",
  "10-20hr/wk",
  "Full time+",
] as const;

export const GRADES = [
  "7th",
  "8th",
  "9th",
  "10th",
  "11th",
  "12th",
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

// Optional country for the signup (OHS is a global online school). "United
// States" leads (the default + most common); the rest are a sane set of major
// countries, alphabetical. Every entry here has a centroid in
// lib/community-map.ts COUNTRY_CENTROIDS — keep the two lists in lockstep.
export const COUNTRIES = [
  "United States",
  "Argentina", "Australia", "Austria", "Bangladesh", "Belgium", "Brazil",
  "Canada", "Chile", "China", "Colombia", "Czech Republic", "Denmark", "Egypt",
  "Finland", "France", "Germany", "Greece", "Hong Kong", "Hungary", "India",
  "Indonesia", "Ireland", "Israel", "Italy", "Japan", "Kenya", "Malaysia",
  "Mexico", "Netherlands", "New Zealand", "Nigeria", "Norway", "Pakistan",
  "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Saudi Arabia", "Singapore", "South Africa", "South Korea", "Spain", "Sweden",
  "Switzerland", "Taiwan", "Thailand", "Turkey", "Ukraine",
  "United Arab Emirates", "United Kingdom", "Vietnam",
] as const;

// Full state name -> USPS two-letter abbreviation (for compact display).
export const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY",
};

export function abbrState(name?: string | null): string | null {
  if (!name) return null;
  return STATE_ABBR[name] ?? name;
}

// Full non-PII option surface returned by GET /api/v1/options.
export const OPTIONS = {
  affiliations: OHS_AFFILIATIONS,
  tech_depth: TECHNICAL_DEPTH,
  skillsets: SKILLSETS,
  time_commitment: TIME_COMMITMENT,
  grades: GRADES,
  builder_interest: BUILDER_INTEREST,
  countries: COUNTRIES,
} as const;

export type OhsAffiliation = (typeof OHS_AFFILIATIONS)[number];
export type TechnicalDepth = (typeof TECHNICAL_DEPTH)[number];
export type Skillset = (typeof SKILLSETS)[number];
export type TimeCommitment = (typeof TIME_COMMITMENT)[number];
export type Grade = (typeof GRADES)[number];
export type Country = (typeof COUNTRIES)[number];
