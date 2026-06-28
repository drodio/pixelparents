// Does a LinkedIn profile's display name plausibly belong to the person we
// searched for? Used to reject blatantly-wrong auto-resolved handles (e.g. Exa
// returning "Sam R" for a "Jordan Lee" search) WITHOUT over-rejecting correct
// matches that merely look different — accents, nicknames, middle names, married
// names, stylized handles (the handle is irrelevant here; we compare DISPLAY
// names parsed from the LinkedIn title).
//
// Rule (deliberately lenient — false rejections lose a real handle): reject ONLY
// when neither the searched first name NOR the searched last name has a match in
// the candidate's name tokens. Any single solid token in common = accept.

const SUFFIXES = new Set([
  "jr", "sr", "ii", "iii", "iv", "v", "phd", "md", "mba", "dr", "mr", "ms", "mrs", "mx",
]);

// Lowercase, strip diacritics, drop punctuation, split, drop initials/suffixes.
export function nameTokens(raw: string): string[] {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !SUFFIXES.has(t));
}

// Two tokens "match" if equal or one is a length-≥4 prefix of the other
// (Alex/Alexander, Cathy/Cathryn, Tan/Tanaka stays a non-match at len 3 — fine).
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.startsWith(a)) return true;
  if (b.length >= 4 && a.startsWith(b)) return true;
  return false;
}

export function nameMatches(searched: string, candidate: string): boolean {
  const a = nameTokens(searched);
  const b = nameTokens(candidate);
  // Can't validate without both names → don't reject (lenient on missing data).
  if (a.length === 0 || b.length === 0) return true;
  const first = a[0]!;
  const last = a[a.length - 1]!;
  const firstHit = b.some((t) => tokenMatch(first, t));
  const lastHit = b.some((t) => tokenMatch(last, t));
  return firstHit || lastHit;
}
