import type { SignupRow } from "@/lib/db/schema/signups";
import { isStudentAccount, isAlumAccount } from "@/lib/family-display";

// Which profile details are still missing after account creation.
//
// Creating an account now asks only for the basics — role, name, email, phone
// (parent feedback, Aug 2026: the old signup was far too long and people bailed
// partway). Everything else moved to "finish your profile", which lives on
// /family. This computes what's left so the dashboard can nudge precisely
// ("Add your interests") instead of vaguely ("Complete your profile").
//
// Deliberately does NOT include anything a member might reasonably never want to
// fill in (LinkedIn, WeChat, website, photos). Nudging someone forever about an
// optional field is worse than not nudging at all — these are only the fields
// that make the directory and interest-matching actually work for them.

export type ProfileGap = {
  key: "interests" | "location" | "affiliation" | "builder";
  label: string;
  // Where the member goes to fill it in.
  href: string;
};

// The valid answers to "are you interested in helping build GoPixel software?".
// Mirrors BUILDER_INTEREST in lib/options.ts; kept local so this module stays
// dependency-light and safe to import from a server component.
const BUILDER_ANSWERS = new Set(["builder", "aspiring", "no"]);

export function profileGaps(row: SignupRow | null | undefined): ProfileGap[] {
  if (!row) return [];
  const gaps: ProfileGap[] = [];

  // Interests drive the shared-interest matching that the whole community runs
  // on, so an empty list is the highest-value thing to fix.
  if (!row.parentInterests || row.parentInterests.length === 0) {
    gaps.push({ key: "interests", label: "Add your interests", href: "/family" });
  }

  // Location plots the family on the community map. Country alone is enough —
  // we never require a city, since plenty of families won't want to give one.
  if (!row.country?.trim() && !row.city?.trim()) {
    gaps.push({ key: "location", label: "Add where you're based", href: "/family" });
  }

  // Affiliation is DERIVED for students and alums (see affiliationForRole), so
  // only a parent can be missing it — never nudge the roles that can't act on it.
  const isStudentOrAlum = isStudentAccount(row) || isAlumAccount(row);
  if (!isStudentOrAlum && !row.ohsAffiliation?.trim()) {
    gaps.push({ key: "affiliation", label: "Tell us your OHS affiliation", href: "/family" });
  }

  // Builder interest. This USED to be a required question at signup, and
  // completeSignup hard-rejected a signup without it — which broke every new
  // account the moment the question was removed from the form. It's collected
  // here instead, and it still powers the builder counts on the landing page.
  const extra = (row.extra ?? {}) as Record<string, unknown>;
  if (!BUILDER_ANSWERS.has(String(extra.builderInterest ?? ""))) {
    gaps.push({ key: "builder", label: "Tell us if you'd like to help build", href: "/family" });
  }

  return gaps;
}

// True when there's nothing left worth nudging about.
export function isProfileComplete(row: SignupRow | null | undefined): boolean {
  return profileGaps(row).length === 0;
}
