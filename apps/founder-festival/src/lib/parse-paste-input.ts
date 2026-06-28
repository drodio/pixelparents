import { canonicalizeLinkedinUrl } from "./canonicalize";

// Optional enrichment fields carried alongside a parsed row. Only present when
// the input supplied them (kept off the object otherwise so existing callers /
// equality checks are unaffected).
type Enrich = {
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  region?: string;
  country?: string;
  locationRaw?: string;
};

export type ParsedLine =
  | ({ kind: "url"; raw: string; linkedinUrl: string } & Enrich)
  | ({ kind: "nameCompany"; raw: string; name: string; company: string | null } & Enrich)
  | { kind: "invalid"; raw: string; reason: string };

// Inline email detector. Excludes commas/semicolons/brackets so it won't swallow
// CSV delimiters.
const EMAIL_RE = /[^\s,;<>()]+@[^\s,;<>()]+\.[^\s,;<>()]+/;

// Inline phone detector: a leading-+ international number, OR a NANP-style
// 3-3-4 with separators. Conservative enough not to grab a 4-digit year in a
// name. Run AFTER the email is stripped.
const PHONE_RE = /\+\d[\d().\s-]{6,}\d|\(?\d{3}\)?[.\s-]\d{3}[.\s-]\d{4}/;

// Normalize a detected phone to E.164-ish so the /account verify flow can use it.
// Keeps a leading +; bare 10-digit → +1; 11-digit starting with 1 → +1….
function normalizePhone(s: string): string {
  if (s.trim().startsWith("+")) return "+" + s.replace(/\D/g, "");
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

// Parse a single textarea line. Accepted forms:
//   https://linkedin.com/in/jane-doe
//   linkedin.com/in/jane-doe
//   Jane Doe, Acme
//   Jane Doe          ← name with no company
//
// Also accepts a messy multi-line YC-search-result paste — see parseYcStyle.
function isProbablyUrl(s: string): boolean {
  return /linkedin\.com\/in\//i.test(s) || /^https?:\/\//i.test(s);
}

// YC batch codes: W09, S13, X23, F24, etc. — letter + 2-digit year.
const YC_BATCH = /^[WSXF]\d{2}$/i;

// Role anchor line in YC paste — "Founder at", "Co-Founder/CEO at", etc.
// Must end with " at" so the company is the next line.
const ROLE_ANCHOR = /^(co-?)?founder[\/\w\s]*\s+at$/i;

// Boilerplate / separator lines that aren't names or companies.
const YC_NOISE = /^(previously at|·|,|\d+\s+more|present|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

// Detect: input contains multi-line YC-style entries. Anchored on the
// presence of at least one "(Co-)?Founder ... at" role line.
function looksYcStyle(text: string): boolean {
  return text.split(/\r?\n/).some((l) => ROLE_ANCHOR.test(l.trim()));
}

// Parse the messy YC-search-result paste format:
//
//   Joe Gebbia
//   W09
//   Founder/CPO at
//   Airbnb (W09)
//   Jan 2008 - Present
//   ·
//   Previously at
//   Chronicle Books
//   ,
//   7 more
//   Brian Chesky
//   Brian Chesky          ← sometimes the name is duplicated
//   W09
//   Founder/CEO at
//   Airbnb (W09)
//   ...
//
// Each "(Co-)?Founder ... at" anchor produces one entry — the company is the
// next non-noise line (with "(W09)" suffix stripped); the name is found by
// walking back, skipping batch codes and duplicates, stopping at the tail
// of the previous entry.
function parseYcStyle(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: ParsedLine[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    if (!ROLE_ANCHOR.test(lines[i])) continue;

    // Company: first non-noise, non-batch line after the anchor.
    let company: string | null = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const cand = lines[j];
      if (!cand || YC_NOISE.test(cand) || YC_BATCH.test(cand)) continue;
      company = cand.replace(/\s*\([WSXF]\d{2}\)\s*$/i, "").trim();
      break;
    }

    // Name: walk back, skip batch codes, duplicates, and the tail of the
    // previous entry. Stop the moment we cross into prev-entry territory
    // (noise lines like "Previously at" or "N more").
    let name = "";
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j];
      if (!prev) continue;
      if (YC_BATCH.test(prev)) continue;
      if (YC_NOISE.test(prev)) break;
      // Skip two-line name duplicates: only when the line above is identical.
      if (j - 1 >= 0 && prev === lines[j - 1]) continue;
      name = prev;
      break;
    }

    if (!name || !company) continue;
    const key = `${name.toLowerCase()}|${company.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "nameCompany", raw: `${name}, ${company}`, name, company });
  }
  return out;
}

export function parsePasteInput(text: string): ParsedLine[] {
  if (looksYcStyle(text)) {
    return parseYcStyle(text);
  }

  const out: ParsedLine[] = [];
  const seenUrls = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) continue;

    // Pull inline email + phone out of the line (paste rows often append them).
    // `work` is the line with both removed + dangling commas cleaned, used for
    // the url/name parse; `raw` stays the original line.
    const clean = (s: string) =>
      s.replace(/,\s*,/g, ",").replace(/^[\s,]+|[\s,]+$/g, "").trim();
    let work = raw;
    const enrich: Enrich = {};
    const emailMatch = work.match(EMAIL_RE);
    if (emailMatch) {
      enrich.email = emailMatch[0].toLowerCase();
      work = clean(work.replace(emailMatch[0], ""));
    }
    const phoneMatch = work.match(PHONE_RE);
    if (phoneMatch) {
      enrich.phone = normalizePhone(phoneMatch[0]);
      work = clean(work.replace(phoneMatch[0], ""));
    }

    if (isProbablyUrl(work)) {
      // Normalize bare hosts (linkedin.com/in/...) to https://
      const withScheme = /^https?:\/\//i.test(work) ? work : `https://${work}`;
      const canonical = canonicalizeLinkedinUrl(withScheme);
      if (!canonical) {
        out.push({ kind: "invalid", raw, reason: "not a valid linkedin.com/in URL" });
        continue;
      }
      if (seenUrls.has(canonical)) continue; // dedupe
      seenUrls.add(canonical);
      out.push({ kind: "url", raw, linkedinUrl: canonical, ...enrich });
      continue;
    }

    // Name, Company  or  Name (email/phone already stripped from `work`).
    // Tab-separated rows (Sheets/Excel/TSV paste) are split on tabs; a plain
    // line splits on commas as before.
    let name: string;
    let company: string | null;
    if (work.includes("\t")) {
      const fields = work.split("\t").map((s) => s.trim()).filter(Boolean);
      name = fields[0] ?? "";
      // Skip columns that merely repeat a part of the name (the First / Last
      // columns of a "Full Name, First, Last, …" export) — the first field that
      // introduces a new token is the company.
      const nameToks = new Set(name.toLowerCase().split(/\s+/).filter(Boolean));
      company =
        fields.slice(1).find((f) => {
          const ft = f.toLowerCase().split(/\s+/).filter(Boolean);
          return ft.length > 0 && !ft.every((t) => nameToks.has(t));
        }) ?? null;
    } else {
      const parts = work.split(",").map((s) => s.trim());
      name = parts[0] ?? "";
      company = parts.slice(1).join(",").trim() || null;
    }
    if (!name || name.length < 2) {
      out.push({ kind: "invalid", raw, reason: "name too short" });
      continue;
    }
    out.push({ kind: "nameCompany", raw, name, company, ...enrich });
  }
  return out;
}
