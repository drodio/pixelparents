// Shared helpers for per-section deep links (?section=<label>). Used by the docs
// markdown renderer (src/lib/docs.ts), the SectionHeading component, and the
// SectionAnchors client controller. Pure — safe in server and client code.

// Stable slug for a heading's id (GitHub-style anchors).
export function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Shareable section param: spaces as "+" (e.g. ?section=Member+Learnings).
// URLSearchParams reads "+" back as a space, so this round-trips cleanly.
export function sectionParam(label: string): string {
  return encodeURIComponent(label).replace(/%20/g, "+");
}

// Absolute deep link to a section on the current page.
export function sectionUrl(label: string): string {
  return `${window.location.origin}${window.location.pathname}?section=${sectionParam(label)}`;
}
