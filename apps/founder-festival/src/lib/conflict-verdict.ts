// A profile conflict = one verified email mapped to ≥2 evaluations. Most of these
// are NOT true duplicates — they're mis-links: the same email got attached to two
// DIFFERENT same-first-name people (e.g. "Adeola Ayoola" vs "Adeola Adesola").
// This pure heuristic gives the admin a quick read on which case they're looking
// at, so they DELETE the wrong twin (mis-link) rather than MERGE two strangers.
// Keys off the LAST name, since conflicting profiles share a first name + email.

export type ConflictVerdict = {
  kind: "same" | "different" | "uncertain";
  label: string;
};

function lastNameToken(full: string | null | undefined): string {
  const toks = (full ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return toks[toks.length - 1] ?? "";
}

export function conflictVerdict(names: (string | null | undefined)[]): ConflictVerdict {
  const lasts = names.map(lastNameToken).filter(Boolean);
  if (lasts.length < 2) return { kind: "uncertain", label: "Uncertain — inspect the profiles" };

  if (lasts.every((l) => l === lasts[0])) {
    return { kind: "same", label: "Likely the same person — safe to merge" };
  }
  // Every profile has a DISTINCT surname → almost certainly different people who
  // happen to share this email (a mis-link). Delete the wrong one, don't merge.
  if (new Set(lasts).size === lasts.length) {
    return { kind: "different", label: "Likely different people — mis-linked email" };
  }
  return { kind: "uncertain", label: "Mixed — inspect the profiles" };
}
