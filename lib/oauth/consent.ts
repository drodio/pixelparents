import { parseScopes, type SupportedScope } from "./config";

// Remembered-consent coverage check (pure, testable). A previously stored consent
// "covers" the current request when its granted scope set is a SUPERSET of the
// scopes now being requested — only then do we skip the consent screen. If the app
// now asks for MORE than was granted (e.g. it added `grade_band`), we must re-prompt
// so the user sees and approves the new disclosure.
export function consentCovers(
  grantedScope: string | null | undefined,
  requestedScopes: readonly SupportedScope[],
): boolean {
  if (!grantedScope) return false;
  const granted = new Set(parseScopes(grantedScope));
  return requestedScopes.every((s) => granted.has(s));
}
