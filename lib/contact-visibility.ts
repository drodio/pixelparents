// Age-16 contact-visibility policy.
//
// A student is treated as a minor by default. We never expose a minor's OWN
// contact info (their student email) to the community — a parent must first
// CERTIFY that the student is 16 or older. Until then, anywhere a student's
// contact would appear, we show the PARENT's contact instead, clearly labeled.
//
// This module is PURE (no DB; it only touches the values the caller passes) so
// the signup flow, the family page, the directory, and the profile page all agree
// on exactly the same rule — and it's unit-tested. Keep ALL age-gating display
// decisions keyed on these helpers so a surface can never drift out of policy.

export type Age16Status = "none" | "pending" | "certified";

export function isAge16Status(v: unknown): v is Age16Status {
  return v === "none" || v === "pending" || v === "certified";
}

// Normalize any stored/absent value to a valid status. Defensive: an old row, a
// NULL, or a bad write reads as the SAFEST option ('none' = masked), never as
// certified — a parsing slip must fail closed, not expose a minor's contact.
export function coerceAge16Status(v: unknown): Age16Status {
  return isAge16Status(v) ? v : "none";
}

// Is the student's OWN contact allowed to be shown? Only once a parent certifies.
export function canShowStudentContact(status: unknown): boolean {
  return coerceAge16Status(status) === "certified";
}

// Is there a pending self-request awaiting a parent's approval?
export function isAge16Pending(status: unknown): boolean {
  return coerceAge16Status(status) === "pending";
}

export type ResolvedContact = {
  // The email to actually display: the student's own when 16+-certified, else the
  // parent's fallback (or null if neither exists).
  email: string | null;
  // True when we're showing the parent's contact instead of the student's own —
  // the UI must render a "this is the parent's contact" note in this case.
  usingParentContact: boolean;
};

// Resolve which contact to display for a student. When 16+-certified AND the
// student has their own email, show it. Otherwise fall back to the parent's
// contact and flag it so the UI can add the "parent's contact" note. Fails closed:
// anything other than an explicit 'certified' + present student email masks.
export function resolveStudentContact(opts: {
  status: unknown;
  studentEmail: string | null | undefined;
  parentEmail: string | null | undefined;
}): ResolvedContact {
  const studentEmail = opts.studentEmail?.trim() || null;
  const parentEmail = opts.parentEmail?.trim() || null;
  if (canShowStudentContact(opts.status) && studentEmail) {
    return { email: studentEmail, usingParentContact: false };
  }
  return { email: parentEmail, usingParentContact: true };
}
