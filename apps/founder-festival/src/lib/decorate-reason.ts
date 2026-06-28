// Split a reason string into ordered chunks based on AI-emitted per-phrase
// citations. Each chunk is either plain text or a phrase with its backing
// sources. The UI renders text chunks as-is and phrase chunks as the inline
// linked treatment.
//
// Pure function — no React, no DOM. Tested in
// tests/lib/decorate-reason.test.ts.

export type Citation = { phrase: string; sources: string[] };

export type ReasonChunk =
  | { kind: "text"; text: string }
  | { kind: "phrase"; text: string; sources: string[] };

// Locate every citation's first occurrence in the reason text and slice the
// string into alternating text / phrase chunks.
//
// Edge cases (all covered by tests):
// - Phrase doesn't appear in reason → silently dropped (also caught
//   upstream by sanitizeCitations, but defensive duplication is cheap and
//   keeps this function safe in isolation).
// - Same phrase appears twice in reason → only the first occurrence is
//   decorated. This avoids subtle issues with sources that backed only the
//   first mention.
// - Overlapping or nested citations → the OUTER (earlier-starting,
//   longer-ending) one wins; the inner one is dropped. Tests verify.
// - Empty citations array → returns a single text chunk with the whole
//   reason.
// - Citations with empty sources arrays are dropped (no value to render).
export function decorateReason(reason: string, citations: Citation[]): ReasonChunk[] {
  if (!reason) return [];
  if (citations.length === 0) return [{ kind: "text", text: reason }];

  // Resolve each citation to { start, end, sources }; drop any whose phrase
  // doesn't appear in the reason or whose sources list is empty.
  type Span = { start: number; end: number; sources: string[] };
  const spans: Span[] = [];
  for (const c of citations) {
    if (!c.phrase || !c.sources?.length) continue;
    const start = reason.indexOf(c.phrase);
    if (start < 0) continue;
    spans.push({ start, end: start + c.phrase.length, sources: c.sources });
  }
  if (spans.length === 0) return [{ kind: "text", text: reason }];

  // Sort spans by start ascending, then by length descending so that when
  // two start at the same position the longer one wins.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop spans that overlap an earlier one (outer wins).
  const accepted: Span[] = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start < lastEnd) continue;
    accepted.push(s);
    lastEnd = s.end;
  }

  // Stitch the chunks.
  const chunks: ReasonChunk[] = [];
  let cursor = 0;
  for (const s of accepted) {
    if (s.start > cursor) {
      chunks.push({ kind: "text", text: reason.slice(cursor, s.start) });
    }
    chunks.push({
      kind: "phrase",
      text: reason.slice(s.start, s.end),
      sources: s.sources,
    });
    cursor = s.end;
  }
  if (cursor < reason.length) {
    chunks.push({ kind: "text", text: reason.slice(cursor) });
  }
  return chunks;
}

// Extract a human-readable domain from a URL for use in popovers.
// Falls back to the raw url if parsing fails.
export function domainOf(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
