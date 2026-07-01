// Pure, side-effect-free assembly of the stored bug-report message + the fields
// createReport wants. Extracted from route.ts so it's unit-testable without a
// Next runtime, a live DB, or Clerk. The route just wires the request + the
// signed-in user into buildErrorReport() and hands the result to createReport().
//
// Guiding rule (PUBLIC repo, admin-visible triage): keep the stored message
// CONCISE and free of secrets. Error messages/digests are attacker/framework
// controlled and can be arbitrarily long, so every field is length-capped and
// newline-collapsed before it lands in the DB.

// Keep the whole assembled message well under the report table's practical size
// and the landing form's own 4000-char cap. These are generous but bounded.
const MAX_ERROR_MESSAGE = 500;
const MAX_DIGEST = 120;
const MAX_URL = 500;
const MAX_LABEL = 254;

// Collapse whitespace/newlines to single spaces, strip control chars, trim, and
// hard-cap length. Returns "" for empty/whitespace-only input. This is the only
// sanitizer these attacker-influenced strings pass through before storage.
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const collapsed = value
    // Strip ASCII control chars (NUL..US and DEL) so nothing weird lands in the
    // admin triage view, then collapse any whitespace run to a single space.
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max).trimEnd() + "…";
}

export type ErrorReportRequest = {
  url?: unknown;
  message?: unknown;
  digest?: unknown;
};

export type ErrorReportRecord = {
  category: "auto-error";
  message: string;
  contactEmail: string | null;
  sourcePath: string | null;
  requestIp: string | null;
};

// Very loose email sanity check — mirrors app/report/actions.ts so the two
// report paths agree on what counts as a contactable address.
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Build the report record from the POST body + the resolved reporter label
// (an email, some other identifier, or null when signed-out / unresolved) and
// the best-effort client IP. Never throws — always returns a storable record.
export function buildErrorReport(args: {
  body: ErrorReportRequest;
  reporterLabel: string | null;
  requestIp: string | null;
}): ErrorReportRecord {
  const url = clean(args.body?.url, MAX_URL);
  const message = clean(args.body?.message, MAX_ERROR_MESSAGE);
  const digest = clean(args.body?.digest, MAX_DIGEST);
  const reporter = clean(args.reporterLabel, MAX_LABEL) || "signed-out";

  const lines = [
    "Auto-reported error (user tapped “Report this bug”).",
    `Reported by: ${reporter}`,
    `Error: ${message || "(no message)"}`,
    `Digest: ${digest || "(none)"}`,
    `Page: ${url || "(unknown)"}`,
  ];

  return {
    category: "auto-error",
    message: lines.join("\n"),
    // The reporter identity is captured inside the message; contactEmail only
    // holds a real address when the label looks like one, so admins can reply.
    contactEmail: looksLikeEmail(reporter) ? reporter : null,
    sourcePath: url || null,
    requestIp: args.requestIp,
  };
}
