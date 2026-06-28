import type { EnricherContext } from "./types";
import { domainHost } from "@/lib/domain-normalize";

// Shared identity-matching helpers for enrichers that hit platforms with NO
// name->account lookup (Hacker News, Stack Overflow, npm, Hugging Face, ...).
//
// The risk these guard against: naively guessing a handle from a name and
// attributing a stranger's reputation to the subject. Verified example — the
// Hacker News handle `jordan` has 113 karma and an empty bio; it is NOT the
// well-known investor of the same name. On a credibility product, a false attribution is worse than a
// missing one, so every helper here favors PRECISION over recall.
//
// This generalizes the confirmation logic that was inline in github.ts.

// Lowercase alphabetic name tokens (drops punctuation, initials of length 1
// are kept since they're useful for handle derivation).
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Generate plausible username candidates for a person. Used to PROBE a
// platform; every probe result must still pass a confirmation check before we
// trust it. Mirrors the handle shapes people actually pick.
export function deriveHandleCandidates(
  ctx: Pick<EnricherContext, "fullName" | "linkedinHandle">,
  opts: { max?: number } = {},
): string[] {
  const max = opts.max ?? 6;
  const handles = new Set<string>();

  // The LinkedIn handle frequently matches the person's handle elsewhere.
  if (ctx.linkedinHandle) {
    handles.add(ctx.linkedinHandle.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  const parts = nameTokens(ctx.fullName).filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    handles.add(`${first}-${last}`); // jane-doe
    handles.add(`${first}${last}`); //  janedoe
    handles.add(`${first}.${last}`); // jane.doe
    handles.add(`${first[0]}${last}`); // jdoe
    handles.add(`${first}${last[0]}`); // janed
    handles.add(first); //              jane
  } else if (parts.length === 1) {
    handles.add(parts[0]!);
  }

  return [...handles].filter((h) => h.length >= 2).slice(0, max);
}

// Does a candidate display name share name tokens with the subject? Requires
// BOTH the subject's first and last token to appear when we know a full name
// (>= 2 tokens); a single shared token (common first names) is too weak.
export function nameOverlaps(
  fullName: string | null | undefined,
  candidateName: string | null | undefined,
): boolean {
  const subject = nameTokens(fullName);
  const cand = new Set(nameTokens(candidateName));
  if (subject.length === 0 || cand.size === 0) return false;
  if (subject.length >= 2) {
    return cand.has(subject[0]!) && cand.has(subject[subject.length - 1]!);
  }
  // Single-token subject name: require an exact token hit.
  return cand.has(subject[0]!);
}

// Does free text (a profile bio / "about" field) corroborate that an account
// belongs to the subject? True when the text references something we already
// independently know about them: their full name, their LinkedIn handle, or
// the host of a URL we already associate with them.
export function textCorroborates(
  ctx: Pick<EnricherContext, "fullName" | "linkedinHandle">,
  text: string | null | undefined,
  knownUrls: string[] = [],
): boolean {
  if (!text) return false;
  const hay = text.toLowerCase();

  // Full name present (all tokens) is a strong signal.
  const subject = nameTokens(ctx.fullName);
  if (subject.length >= 2 && subject.every((t) => hay.includes(t))) return true;

  // LinkedIn handle present.
  const handle = ctx.linkedinHandle?.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (handle && handle.length >= 4 && hay.includes(handle)) return true;

  // Any known URL's host appears in the bio (e.g., their github / company site).
  for (const u of knownUrls) {
    const host = domainHost(u);
    if (host && host.length >= 4 && hay.includes(host)) return true;
  }
  return false;
}

// Pull the first capture group from any URL matching `pattern`. Use to extract
// a confirmed handle when Exa already surfaced a profile URL (highest trust).
export function handleFromUrls(urls: string[], pattern: RegExp): string | null {
  for (const u of urls) {
    const m = u.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}
