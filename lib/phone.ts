// International phone handling for a school whose families are all over the map.
//
// From the Aug 2026 student walkthrough: "if a student is from China, would it be
// able to automatically detect, or does it only allow American phone numbers?
// ... a way to format it so you can tell, oh, my phone number is from the US, my
// phone number is from China."
//
// THE RULE THAT MATTERS: this never rejects a number.
//
// The families most likely to type something this file doesn't recognise are
// exactly the international families the school wants to reach, so a validator
// that gets clever is a validator that locks out the people it should serve.
// Country detection is a convenience for display; it is never a gate. Anything
// with enough digits to be a phone number is accepted, recognised or not.
//
// No dependency on purpose. A full E.164 library is ~150KB of parsing rules for
// a field that needs to do two things: say which country a number looks like,
// and print it back readably.

export type Country = {
  iso: string;
  name: string;
  dial: string; // including the leading +
  flag: string;
};

// Curated rather than exhaustive: the places OHS families actually live, most
// common first. "Other" is not an error state, it's the honest answer for the
// long tail, and a number lands there without anything breaking.
export const COUNTRIES: readonly Country[] = [
  { iso: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { iso: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { iso: "TW", name: "Taiwan", dial: "+886", flag: "🇹🇼" },
  { iso: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰" },
  { iso: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { iso: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { iso: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { iso: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { iso: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { iso: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { iso: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { iso: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
] as const;

export const digitsOf = (s: string): string => (s ?? "").replace(/\D/g, "");

// Which country does this look like?
//
// Only answers when the number carries an explicit "+" country code. A bare
// 10-digit number is assumed to be US/Canada because that's the overwhelming
// local default, and guessing at anything else from digits alone would be
// worse than saying nothing.
//
// +1 is deliberately reported as US: US and Canada share a dial code and
// nothing in a bare +1 number distinguishes them. Claiming to know would be a
// lie; US is the more common case and the member can correct it.
export function detectCountry(input: string): Country | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const d = digitsOf(raw);
    if (!d) return null;
    // Longest dial code first, so +1 never shadows +1-something and +86 is
    // never mistaken for +8.
    const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    const hit = byLength.find((c) => d.startsWith(c.dial.slice(1)));
    if (hit) return hit.dial === "+1" ? COUNTRIES[0]! : hit;
    return null; // a real country we don't list: unknown, NOT invalid
  }

  // No "+": treat a 10-digit number as North American, which is what a US
  // family types. Anything else stays unknown rather than being guessed at.
  const d = digitsOf(raw);
  if (d.length === 10) return COUNTRIES[0]!;
  if (d.length === 11 && d.startsWith("1")) return COUNTRIES[0]!;
  return null;
}

// Store one canonical shape so two people who typed the same number match.
// Adds the country code when the member picked one and didn't type it.
export function toE164(input: string, country?: Country | null): string {
  const raw = (input ?? "").trim();
  const d = digitsOf(raw);
  if (!d) return "";
  if (raw.startsWith("+")) return `+${d}`;
  if (country) {
    const cc = country.dial.slice(1);
    // Don't double the country code if they typed it without the plus.
    return d.startsWith(cc) && d.length > cc.length ? `+${d}` : `+${cc}${d}`;
  }
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return raw; // unknown shape: keep exactly what they typed
}

// Readable version. Countries whose grouping we know for sure get it (US 3-3-4,
// China mobile 3-4-4 — the two the community actually asked for, Aug 2026 V2
// feedback doc: the field should FORMAT per country rather than announce
// "Detected China"); for the rest, a dial code plus the digits is honest and
// doesn't impose a grouping that may be wrong.
export function formatPhone(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const c = detectCountry(raw);
  const d = digitsOf(raw);

  if (c?.iso === "US") {
    const local = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
    if (local.length === 10) {
      return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
  }
  if (c?.iso === "CN") {
    const local = d.startsWith("86") ? d.slice(2) : d;
    if (local.length === 11) {
      return `+86 ${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`;
    }
  }
  if (raw.startsWith("+") && c) {
    const rest = d.slice(c.dial.length - 1);
    return `${c.dial} ${rest}`;
  }
  return raw;
}

// What to show next to the field: a flag and country name once we can tell, and
// nothing at all when we can't. An empty hint is correct — a wrong flag is
// worse than no flag.
export function countryHint(input: string): { flag: string; label: string } | null {
  const c = detectCountry(input);
  if (!c) return null;
  return { flag: c.flag, label: c.name };
}

// The only validity rule: enough digits to plausibly be a phone number, few
// enough to not be something else pasted by accident. Everything in between is
// accepted, whether or not we recognise the country.
export function isPlausiblePhone(input: string): boolean {
  const d = digitsOf(input);
  return d.length >= 7 && d.length <= 15;
}
