// Pure helpers for how the /family tab GROUPS and DEDUPS its members. Kept free
// of DB / node:crypto imports so it's unit-testable (and safe to reason about in
// isolation): the security-relevant writes live in the family server actions; this
// is purely the read-side display projection.
//
// A "family" is the set of signups sharing a family_id. A member is a STUDENT
// ACCOUNT when extra.accountType === "student"; everyone else is a parent /
// guardian. A `children` row whose student_email matches a student account's
// VERIFIED student email is the SAME person as that account — we show ONE entry
// (the account, enriched with the child row's grade + interests) instead of two.
// Child rows with no matching account still render as kids. Nothing is deleted.

// Minimal shapes — only the fields the projection needs, so callers can pass
// SignupRow / ChildRow (or test fixtures) without coupling to the full schema.
export type DisplayMember = {
  id: string;
  extra?: Record<string, unknown> | null;
};

export type DisplayChild = {
  id: string;
  grade: string | null;
  interests: string[] | null;
  studentEmail: string | null;
};

export type StudentProfile = { grade: string | null; interests: string[] };

export type FamilyDisplay<M extends DisplayMember, C extends DisplayChild> = {
  // Parents/guardians and student accounts, each in caller-first order.
  parentMembers: M[];
  studentMembers: M[];
  // grade + interests to enrich a deduped student account's card, keyed by id.
  studentProfileByAccountId: Map<string, StudentProfile>;
  // Child rows folded into a matching account (hidden from the Children list).
  foldedChildIds: Set<string>;
  // Child rows with no matching student account — still rendered as kids.
  unmatchedKids: C[];
};

export function isStudentAccount(m: DisplayMember): boolean {
  return ((m.extra ?? {}) as Record<string, unknown>).accountType === "student";
}

// Read a member's verified OHS student emails from its `extra` jsonb, tolerating
// both the array (`verifiedStudentEmails`) and the legacy singular field
// (`verifiedStudentEmail`). Mirrors lib/verify.ts `verifiedEmailsOf` but inlined
// so this module stays free of the node:crypto import that file carries — the
// caller may instead pass a precomputed reader (see buildFamilyDisplay's param).
function verifiedEmailsFromExtra(extra: Record<string, unknown>): string[] {
  const list = extra.verifiedStudentEmails;
  if (Array.isArray(list)) {
    return list.filter((e): e is string => typeof e === "string" && e.length > 0);
  }
  const single = extra.verifiedStudentEmail;
  return typeof single === "string" && single ? [single] : [];
}

// Build the /family display projection. `self` (the caller) is ordered first
// within its group. `verifiedEmailsOf` is injectable so the page can pass the
// canonical lib/verify reader; it defaults to the inlined equivalent here.
export function buildFamilyDisplay<M extends DisplayMember, C extends DisplayChild>(
  members: M[],
  kids: C[],
  selfId: string,
  verifiedEmailsOf: (extra: Record<string, unknown>) => string[] = verifiedEmailsFromExtra,
): FamilyDisplay<M, C> {
  // Caller first, then the rest in their incoming (oldest-first) order.
  const self = members.find((m) => m.id === selfId);
  const rest = members.filter((m) => m.id !== selfId);
  const ordered = self ? [self, ...rest] : rest;

  const parentMembers = ordered.filter((m) => !isStudentAccount(m));
  const studentMembers = ordered.filter((m) => isStudentAccount(m));

  // Map every verified student email (lowercased) → its account id.
  const studentEmailToAccountId = new Map<string, string>();
  for (const m of studentMembers) {
    const verified = verifiedEmailsOf((m.extra ?? {}) as Record<string, unknown>);
    for (const e of verified) {
      const key = e.trim().toLowerCase();
      if (key) studentEmailToAccountId.set(key, m.id);
    }
  }

  const studentProfileByAccountId = new Map<string, StudentProfile>();
  const foldedChildIds = new Set<string>();
  for (const k of kids) {
    const key = k.studentEmail?.trim().toLowerCase();
    if (!key) continue;
    const accountId = studentEmailToAccountId.get(key);
    if (!accountId) continue; // no matching account → render as a kid
    foldedChildIds.add(k.id);
    if (!studentProfileByAccountId.has(accountId)) {
      studentProfileByAccountId.set(accountId, {
        grade: k.grade,
        interests: k.interests ?? [],
      });
    }
  }

  const unmatchedKids = kids.filter((k) => !foldedChildIds.has(k.id));

  return {
    parentMembers,
    studentMembers,
    studentProfileByAccountId,
    foldedChildIds,
    unmatchedKids,
  };
}
