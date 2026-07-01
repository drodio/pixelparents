// PURE, DB-free validator/normalizer for a user-supplied LinkedIn profile URL.
// Lives outside the "use server" actions module so it can be unit-tested and
// imported by both the server action and the client editor without dragging in
// server-only code. Mirrors the http(s)-only, XSS-safe parsing rules that
// lib/resources-label.ts#validateResourceUrl uses (only http/https accepted, a
// real host with a dot required, a bare "linkedin.com/in/x" upgraded to https),
// but with LinkedIn-appropriate messaging and an empty-means-clear semantics so
// a parent can remove a previously-saved link.

export const LINKEDIN_URL_MAX = 2048;

export type LinkedinResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

function cleanLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Validate + normalize. An empty string resolves to { ok, value: null } so the
// same action both saves and clears the field. A non-empty value must parse as
// an http(s) URL with a real host; a scheme-less host is upgraded to https://.
export function validateLinkedinUrl(input: unknown): LinkedinResult {
  const raw = cleanLine(input);
  if (!raw) return { ok: true, value: null };
  if (raw.length > LINKEDIN_URL_MAX)
    return { ok: false, error: "That link is too long." };

  // Upgrade a scheme-less host ("linkedin.com/in/you") to https:// so the URL
  // parser doesn't misread it as a bare path.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Links must start with http:// or https://" };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  return { ok: true, value: parsed.toString() };
}
