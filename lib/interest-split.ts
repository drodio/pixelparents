// One interest per chip. Comma or semicolon lists ("Dancing, Hiking") arrive by
// paste or blur and were stored as a single interest, which then sat beside a
// separate "Hiking" in the shared list. Pure, so the picker (client) and the
// pool/save path (server) split identically.
export function splitInterestEntry(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitInterestEntries(list: Iterable<string>): string[] {
  const out: string[] = [];
  for (const raw of list) out.push(...splitInterestEntry(raw));
  return out;
}

// The identity key for an interest: case- and whitespace-insensitive, and a
// "Label: Title" prefix is singular/plural-insensitive, so "Books: Percy
// Jackson" and "Book: percy jackson" are one interest. Only the prefix before a
// colon is normalized; "Cars" and "Car" stay distinct.
export function interestKey(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const m = /^([^:]+?)\s*:\s*(.+)$/.exec(s);
  if (!m) return s;
  const prefix = m[1]!.length > 3 && m[1]!.endsWith("s") ? m[1]!.slice(0, -1) : m[1]!;
  return `${prefix}: ${m[2]}`;
}
