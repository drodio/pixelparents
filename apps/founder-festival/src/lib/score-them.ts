// The "Score them now" contract, shared by the writer and the reader so the two
// ends can't drift:
//   - ScoreThemPrompt builds a link to the homepage with the searched name.
//   - SplashForm reads that name back on load to pre-fill + auto-run the
//     find-my-LinkedIn helper.
//
// Names shorter than this don't trigger the helper auto-run — the find-handle
// search itself requires ≥2 characters, so a 1-char `?name=` is a no-op.
export const MIN_SCORE_NAME_LENGTH = 2;

/**
 * Homepage URL that pre-fills `name` into the find-my-LinkedIn helper.
 *
 * `home=1` is required: the homepage otherwise redirects a signed-in, already-
 * claimed user straight to their /profile (see src/app/(authed)/page.tsx), so
 * without it "Score them now" would never reach the splash/scoring flow.
 */
export function scoreThemHref(name: string): string {
  return `/?home=1&name=${encodeURIComponent(name.trim())}`;
}

/**
 * Extract the pre-fill name from a URL query string (e.g. `window.location.search`).
 * Returns the trimmed name when it's long enough to act on, else null.
 */
export function parseNameParam(search: string): string | null {
  const raw = new URLSearchParams(search).get("name");
  const trimmed = raw?.trim() ?? "";
  return trimmed.length >= MIN_SCORE_NAME_LENGTH ? trimmed : null;
}
