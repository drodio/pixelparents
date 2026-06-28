// MatchProfile is the subset of evaluations.profile JSONB that the matcher
// reads. Populated by Claude during scoring (see SCORING_SCHEMA).
export type MatchProfile = {
  fullName?: string | null;
  primaryCompanyDomain?: string | null;
  publicEmail?: string | null;
  githubUsername?: string | null;
};

// ClerkClaim is what /claim/callback's `toClerkClaim()` produces from the
// Clerk session. Per the Task 1 diagnostic, LinkedIn OIDC does NOT expose
// the vanity URL — we have only verified email + first/last name.
export type ClerkClaim =
  | {
      provider: "linkedin";
      email?: string;
      firstName?: string | null;
      lastName?: string | null;
    }
  | {
      provider: "github";
      githubUsername?: string;
    }
  | {
      provider: "email";
      email?: string;
    };

export type MatchSignal =
  | "linkedin-email-exact"
  | "linkedin-email-name-company"
  | "linkedin-name-match"
  | "github-username"
  | "email-exact"
  | "email-name-company"
  // Verify-to-own: a medium (name-only) claimer who can't auto-verify via email
  // explicitly attests the matched LinkedIn profile is theirs. Owning ("high")
  // by policy decision — weaker than the email/domain proofs, so every use is
  // recorded on the users row (verifiedSignal) for audit. See /api/claim/verify.
  | "linkedin-url-attested";

export type NoMatchReason =
  | "linkedin-no-signal"
  | "github-no-stored-username"
  | "github-username-mismatch"
  | "email-no-domain"
  | "email-no-signal";

export type MatchResult =
  | { kind: "match"; signal: MatchSignal }
  | { kind: "no-match"; reason: NoMatchReason };

// Confidence tier stored on users.matchConfidence. Only "high" grants the
// ability to MUTATE a profile (re-score, edit recommendations/score-items,
// confirm badges, view private data). "medium" means "claimed, but on a weak
// signal" — it links the user to the eval for display/dedup but must NOT unlock
// mutation.
export type MatchConfidenceLevel = "high" | "medium" | "low";

// SECURITY (P0-1): map a match signal to its confidence tier. A LinkedIn name
// match relies solely on the user-EDITABLE Clerk firstName/lastName compared to
// a PUBLIC display name — anyone can set their Clerk name to a target founder's
// name and "match". So name-only tops out at "medium" (non-owning). Every other
// signal proves control of a verified email, a company domain + name, or a
// GitHub account that the subject's profile already records, and stays "high".
export function signalConfidence(signal: MatchSignal): MatchConfidenceLevel {
  return signal === "linkedin-name-match" ? "medium" : "high";
}

// SECURITY (P0-1): the single source of truth for "is this claim strong enough
// to MUTATE the profile?". Centralizes a high/medium check that used to be
// copy-pasted across 6 routes (a forgotten/loosened copy is how ownership bugs
// creep in). Only an exact "high" qualifies — "medium" (name-only) and anything
// else do not.
export function isOwningConfidence(
  matchConfidence: string | null | undefined,
): boolean {
  return matchConfidence === "high";
}

// Internal: try the two email-based tiers against a given email.
// Returns the matched signal name or null if neither tier fires.
function checkEmailTiers(
  email: string,
  profile: MatchProfile | null,
  exactSignal: MatchSignal,
  nameCompanySignal: MatchSignal,
): MatchSignal | null {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !normalized.includes("@")) return null;
  const [localPart, claimDomain] = normalized.split("@");
  if (!localPart || !claimDomain) return null;

  // Tier 1: exact match against publicEmail
  const storedEmail = profile?.publicEmail?.toLowerCase().trim();
  if (storedEmail && storedEmail === normalized) return exactSignal;

  // Tier 2: domain matches primaryCompanyDomain AND local-part matches name
  const targetDomain = profile?.primaryCompanyDomain;
  const fullName = profile?.fullName ?? "";
  if (
    targetDomain &&
    fullName.trim() &&
    domainMatches(claimDomain, targetDomain) &&
    localPartMatchesName(localPart, fullName)
  ) {
    return nameCompanySignal;
  }
  return null;
}

export function matchConfidence(
  claim: ClerkClaim,
  _evaluationLinkedinUrl: string, // kept for API stability; ignored (vanity not available via Clerk OIDC)
  profile: MatchProfile | null,
): MatchResult {
  if (claim.provider === "linkedin") {
    // Tier A: email-based (reuse the same logic as the email provider)
    if (claim.email) {
      const sig = checkEmailTiers(claim.email, profile, "linkedin-email-exact", "linkedin-email-name-company");
      if (sig) return { kind: "match", signal: sig };
    }
    // Tier B: name match. LinkedIn surfaces a customized firstName (display
    // brand like "DROdio") and may pack the formal name into lastName
    // ("- Daniel R. Odio"). It may also drop middle names from the profile
    // entirely ("Daniel Odio" instead of "Daniel Rubén Odio"). To handle both
    // directions: require matching surnames (last non-trivial token) AND at
    // least one other token shared by both names. Single-token names on
    // either side fall back to exact equality.
    if (profile?.fullName && claim.firstName && claim.lastName) {
      if (linkedinNameMatch(`${claim.firstName} ${claim.lastName}`, profile.fullName)) {
        return { kind: "match", signal: "linkedin-name-match" };
      }
    }
    return { kind: "no-match", reason: "linkedin-no-signal" };
  }

  if (claim.provider === "github") {
    const stored = profile?.githubUsername?.toLowerCase().trim();
    if (!stored) return { kind: "no-match", reason: "github-no-stored-username" };
    const claimUser = claim.githubUsername?.toLowerCase().trim();
    if (!claimUser) return { kind: "no-match", reason: "github-username-mismatch" };
    return claimUser === stored
      ? { kind: "match", signal: "github-username" }
      : { kind: "no-match", reason: "github-username-mismatch" };
  }

  if (claim.provider === "email") {
    if (!claim.email || !claim.email.includes("@")) {
      return { kind: "no-match", reason: "email-no-domain" };
    }
    const sig = checkEmailTiers(claim.email, profile, "email-exact", "email-name-company");
    if (sig) return { kind: "match", signal: sig };
    return { kind: "no-match", reason: "email-no-signal" };
  }

  return { kind: "no-match", reason: "email-no-signal" };
}

// Strip diacritics by NFD-normalizing and dropping combining marks (U+0300–U+036F).
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Split a full name into normalized tokens (preserves order). Strips
// diacritics + punctuation, lowercases, removes single-char tokens (initials
// like "R" in "Daniel R Odio") so they don't influence overlap.
function nameTokenList(s: string): string[] {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// Match a Clerk-provided LinkedIn name against a stored profile fullName.
// Symmetric: both sides may have extra tokens (handle, middle name) the
// other lacks. Single-token names fall back to exact equality to avoid
// false positives like "John" matching "John Smith".
function linkedinNameMatch(claimName: string, profileName: string): boolean {
  const a = nameTokenList(claimName);
  const b = nameTokenList(profileName);
  if (a.length === 0 || b.length === 0) return false;
  if (a.length === 1 || b.length === 1) {
    return a.length === b.length && a[0] === b[0];
  }
  if (a[a.length - 1] !== b[b.length - 1]) return false; // surname must match
  const restA = new Set(a.slice(0, -1));
  const restB = new Set(b.slice(0, -1));
  for (const t of restA) if (restB.has(t)) return true;
  return false;
}

function tokenizeName(fullName: string): { first: string; last: string } | null {
  const cleaned = stripDiacritics(fullName).toLowerCase().trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : first; // single-token name: first === last
  return { first, last };
}

function buildLocalPartCandidates(first: string, last: string): Set<string> {
  const same = first === last;
  const set = new Set<string>([
    first,
    last,
    same ? "" : `${first}${last}`,
    same ? "" : `${first}.${last}`,
    same ? "" : `${first}_${last}`,
    same ? "" : `${first}-${last}`,
    same ? "" : `${first[0]}${last}`,
    same ? "" : `${first[0]}.${last}`,
    same ? "" : `${first[0]}_${last}`,
    same ? "" : `${last}${first}`,
    same ? "" : `${last}.${first}`,
  ]);
  set.delete("");
  return set;
}

export function localPartMatchesName(rawLocalPart: string, rawFullName: string): boolean {
  const local = stripDiacritics(rawLocalPart.trim().toLowerCase()).split("+")[0];
  if (!local) return false;
  const tokens = tokenizeName(rawFullName);
  if (!tokens) return false;
  const candidates = buildLocalPartCandidates(tokens.first, tokens.last);
  // Also accept an initials-of-given-names + last-name handle, e.g.
  // "Daniel Rubén Odio" → "drodio" (D.R. + Odio). Common for people who go by
  // an initials handle. Still requires the surname in full, so it stays
  // specific (a different storytell.ai employee won't collide).
  const all = stripDiacritics(rawFullName).toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (all.length >= 2) {
    const last = all[all.length - 1];
    const givenInitials = all.slice(0, -1).map((t) => t[0]).join("");
    candidates.add(`${givenInitials}${last}`);
  }
  return candidates.has(local);
}

export function domainMatches(claim: string, target: string): boolean {
  const c = claim.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (!c || !t) return false;
  if (c === t) return true;
  return c.endsWith(`.${t}`);
}
