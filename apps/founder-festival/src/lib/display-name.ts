// Best-effort human name from a LinkedIn /in/ handle, for profiles we couldn't
// score (low-signal evals store full_name = null). Drops a trailing LinkedIn
// disambiguation id (e.g. "john-smith-8bb1a6143" → "John Smith") and title-cases.
// Not a substitute for a real name — used only as a display fallback.
export function humanizeLinkedinHandle(linkedinUrl: string): string | null {
  const handle = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
  if (!handle) return null;
  const segments = decodeURIComponent(handle).toLowerCase().split("-").filter(Boolean);
  if (segments.length === 0) return null;
  // Drop a trailing id-like segment (pure number, or an alphanumeric hash with a
  // digit) — but never drop the only segment.
  if (segments.length > 1) {
    const last = segments[segments.length - 1]!;
    const idLike = /^\d+$/.test(last) || (/\d/.test(last) && last.length >= 4);
    if (idLike) segments.pop();
  }
  const name = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
    .trim();
  return name || null;
}
