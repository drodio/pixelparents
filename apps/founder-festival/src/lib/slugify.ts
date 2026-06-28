// Pure, DB-free slug helper — safe to import from client components and server
// routes alike. "Summer Solstice Founder + Investor Day" → "summer-solstice-
// founder-investor-day". Lowercases, strips accents, collapses any run of
// non-alphanumerics to a single hyphen, trims edge hyphens, caps at 60 chars.
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // a trailing hyphen can survive the slice
}

// A valid stored slug: one or more lowercase letters / digits / hyphens.
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9-]+$/.test(s);
}

// Event slugs are more permissive than the global hyphen-only convention: admins
// can use hyphens, UNDERSCORES, and PLUS signs (e.g. "unconference+dinner"). Keeps
// those three separators verbatim, collapses any other run of invalid chars to a
// hyphen, trims edge separators, caps at 60. Used by the event slug editor + its
// save endpoint only — does NOT change `slugify`, which hosts/sponsors rely on.
export function slugifyEvent(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_+-]+/g, "-")
    .replace(/^[-_+]+|[-_+]+$/g, "")
    .slice(0, 60)
    .replace(/[-_+]+$/g, ""); // a trailing separator can survive the slice
}

// A valid stored EVENT slug: lowercase letters / digits / hyphens / underscores / plus.
export function isValidEventSlug(s: string): boolean {
  return /^[a-z0-9_+-]+$/.test(s);
}
