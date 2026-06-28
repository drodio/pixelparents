const LINKEDIN_HANDLE = /^\/in\/[^/]+\/?$/;

export function canonicalizeLinkedinUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com") return null;
  const path = url.pathname.toLowerCase().replace(/\/$/, "");
  if (!LINKEDIN_HANDLE.test(path + "/") && !LINKEDIN_HANDLE.test(path)) return null;
  return `https://linkedin.com${path}`;
}

export function isValidLinkedinUrl(input: string): boolean {
  return canonicalizeLinkedinUrl(input) !== null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cheap pre-flight before passing a string into a Drizzle `eq(uuidCol, …)`
// query — Postgres throws "invalid input syntax for type uuid" on bad input,
// which surfaces as a 500 on RSC pages. Validate format first and treat
// non-UUIDs the same as not-found.
export function isUuid(input: string | undefined | null): input is string {
  return typeof input === "string" && UUID_RE.test(input);
}
