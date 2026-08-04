// Pure rules for linking two families together.
//
// Approving a link grants mutual access to profiles AND children, so the guards
// live here, isolated from the DB, and are unit-tested. Anything that could let
// someone attach themselves to a stranger's family belongs in this file.

export type LinkTarget = {
  email: string;
  // Null when nobody with that email has an account yet.
  signupId: string | null;
  familyId: string | null;
};

export type LinkRequester = {
  signupId: string;
  familyId: string;
  email: string;
};

export type LinkCheck = { ok: true } | { ok: false; reason: string };

function norm(email: string): string {
  return email.trim().toLowerCase();
}

// Can `requester` ask to join `target`'s family?
export function canRequestLink(requester: LinkRequester, target: LinkTarget): LinkCheck {
  const to = norm(target.email);
  if (!to || !to.includes("@")) {
    return { ok: false, reason: "Enter a valid email address." };
  }
  if (norm(requester.email) === to) {
    return { ok: false, reason: "That's your own email address." };
  }
  if (!target.signupId || !target.familyId) {
    // Deliberately NOT an error the caller should surface as "no such user" —
    // see linkNotFoundMessage(), which avoids confirming whether an email is
    // registered (that would make this an account-enumeration oracle).
    return { ok: false, reason: "NOT_FOUND" };
  }
  if (target.familyId === requester.familyId) {
    return { ok: false, reason: "You're already in the same family." };
  }
  return { ok: true };
}

// Shown when the target email has no account. Phrased so it does NOT reveal
// whether the address is registered — it reads the same either way — while still
// telling the user what to do next.
export function linkNotFoundMessage(): string {
  return "If that email has a GoPixel account, we've sent them a request to approve. If they don't have one yet, invite them instead.";
}

// Everyone who moves when a request is approved. The requester's ENTIRE family
// moves into the target's family, so the approval UI can name them all — a
// co-parent should never be relocated invisibly.
export function membersMovedByLink(
  fromFamilyMembers: { id: string; firstName: string | null; isStudent: boolean }[],
): { count: number; names: string[]; hasOtherAdults: boolean } {
  const names = fromFamilyMembers
    .map((m) => (m.firstName ?? "").trim())
    .filter((n) => n.length > 0);
  return {
    count: fromFamilyMembers.length,
    names,
    // Surfaced as a warning: linking is normally one person joining a family, so
    // more than one adult moving is worth showing prominently before approval.
    hasOtherAdults: fromFamilyMembers.filter((m) => !m.isStudent).length > 1,
  };
}

// Only the person who was asked (or a member of their family) may decide.
// Without this, anyone holding a request id could approve themselves in.
export function canDecideLink(
  request: { toSignupId: string | null; toEmail: string; status: string },
  decider: { signupId: string; email: string; familyId: string },
  targetFamilyId: string | null,
): LinkCheck {
  if (request.status !== "pending") {
    return { ok: false, reason: "That request has already been handled." };
  }
  const sameEmail = norm(request.toEmail) === norm(decider.email);
  const sameFamily = Boolean(targetFamilyId) && targetFamilyId === decider.familyId;
  const sameSignup = request.toSignupId != null && request.toSignupId === decider.signupId;
  if (!sameEmail && !sameFamily && !sameSignup) {
    return { ok: false, reason: "This request wasn't sent to you." };
  }
  return { ok: true };
}

// Guard against spamming one person with repeated asks.
export const MAX_PENDING_OUTGOING = 5;

export function canCreateAnotherRequest(pendingOutgoing: number): LinkCheck {
  return pendingOutgoing >= MAX_PENDING_OUTGOING
    ? { ok: false, reason: "You have too many pending link requests. Wait for those first." }
    : { ok: true };
}
