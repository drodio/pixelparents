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
  key: "interests" | "location" | "affiliation";
  label: string;
  // Where the member goes to fill it in.
  href: string;
};

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

  return gaps;
}

// True when there's nothing left worth nudging about.
export function isProfileComplete(row: SignupRow | null | undefined): boolean {
  return profileGaps(row).length === 0;
}
