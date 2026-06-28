// Curated list of countries for the SMS phone-number picker. ISO 3166-1
// alpha-2 code, display name, and E.164 dial code. Sorted alphabetically
// by name with the US first so the most common case is one click.
// Add more as needed — this is a starting set of common Founder Festival
// audience countries.
export type Country = {
  iso: string;
  name: string;
  dial: string;
};

export const COUNTRIES: Country[] = [
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "DE", name: "Germany", dial: "+49" },
  { iso: "FR", name: "France", dial: "+33" },
  { iso: "NL", name: "Netherlands", dial: "+31" },
  { iso: "ES", name: "Spain", dial: "+34" },
  { iso: "IT", name: "Italy", dial: "+39" },
  { iso: "IE", name: "Ireland", dial: "+353" },
  { iso: "SE", name: "Sweden", dial: "+46" },
  { iso: "NO", name: "Norway", dial: "+47" },
  { iso: "DK", name: "Denmark", dial: "+45" },
  { iso: "FI", name: "Finland", dial: "+358" },
  { iso: "CH", name: "Switzerland", dial: "+41" },
  { iso: "AT", name: "Austria", dial: "+43" },
  { iso: "BE", name: "Belgium", dial: "+32" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "PL", name: "Poland", dial: "+48" },
  { iso: "CZ", name: "Czech Republic", dial: "+420" },
  { iso: "GR", name: "Greece", dial: "+30" },
  { iso: "IL", name: "Israel", dial: "+972" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "HK", name: "Hong Kong", dial: "+852" },
  { iso: "JP", name: "Japan", dial: "+81" },
  { iso: "KR", name: "South Korea", dial: "+82" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "TW", name: "Taiwan", dial: "+886" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "MY", name: "Malaysia", dial: "+60" },
  { iso: "TH", name: "Thailand", dial: "+66" },
  { iso: "PH", name: "Philippines", dial: "+63" },
  { iso: "VN", name: "Vietnam", dial: "+84" },
  { iso: "NZ", name: "New Zealand", dial: "+64" },
  { iso: "MX", name: "Mexico", dial: "+52" },
  { iso: "BR", name: "Brazil", dial: "+55" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "CO", name: "Colombia", dial: "+57" },
  { iso: "ZA", name: "South Africa", dial: "+27" },
  { iso: "NG", name: "Nigeria", dial: "+234" },
  { iso: "KE", name: "Kenya", dial: "+254" },
  { iso: "EG", name: "Egypt", dial: "+20" },
  { iso: "TR", name: "Turkey", dial: "+90" },
  { iso: "UA", name: "Ukraine", dial: "+380" },
];

// Render the country flag as a Unicode emoji from its ISO alpha-2 code.
// "US" → 🇺🇸. Works in every modern browser/OS that has emoji fonts.
export function flagEmoji(iso: string): string {
  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  if (iso.length !== 2) return "🏳";
  return String.fromCodePoint(
    A + (iso.toUpperCase().charCodeAt(0) - 65),
    A + (iso.toUpperCase().charCodeAt(1) - 65),
  );
}

export function defaultCountry(): Country {
  return COUNTRIES[0]!; // US
}
