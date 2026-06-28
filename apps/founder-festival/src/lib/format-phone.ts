// E.164 → human-readable phone formatter. NANP numbers (+1 + 10 digits) render
// as "+1 (XXX) XXX-XXXX"; international numbers render as "<dial> <rest>" with
// no further grouping (we don't ship a full libphonenumber).
//
// The country-code prefix is parsed by longest-prefix match against the known
// dial codes in COUNTRIES — NOT by a greedy regex. A greedy regex (the prior
// implementation) would chew "+12022503846" as "+120" + "22503846".

import { COUNTRIES } from "@/lib/country-codes";

const KNOWN_DIALS: string[] = (() => {
  const seen = new Set<string>();
  for (const c of COUNTRIES) seen.add(c.dial);
  // Longest first so we don't match "+1" inside "+12".
  return [...seen].sort((a, b) => b.length - a.length);
})();

export function formatPhone(e164: string): string {
  if (!e164.startsWith("+")) return e164;
  const dial = KNOWN_DIALS.find((d) => e164.startsWith(d));
  if (!dial) return e164;
  const rest = e164.slice(dial.length);
  if (!/^\d+$/.test(rest)) return e164;
  if (dial === "+1" && rest.length === 10) {
    return `${dial} (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  return `${dial} ${rest}`;
}
