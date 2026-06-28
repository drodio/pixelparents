// Convert a dropped CSV into the line format the job form already understands
// (parsePasteInput): one "Name, Company" or LinkedIn-URL per line. Pure — no
// DOM — so it's unit-testable and reusable.

// RFC-4180-ish parser: handles quoted fields, embedded commas/newlines, and
// doubled-quote escapes. Cells are trimmed. Trailing newline yields no extra
// row.
export function parseCsv(text: string): string[][] {
  // Strip a leading UTF-8 BOM (common in spreadsheet/CRM exports) so the first
  // header cell isn't corrupted (e.g. "﻿first_name").
  text = text.replace(/^﻿/, "");
  // Pick the field delimiter: a tab if the first line is tab-separated (Google
  // Sheets / Excel / TSV exports), else a comma. Splitting a TSV on commas
  // collapsed every row into one cell — the source of the wrong-LinkedIn bug.
  const firstLine = text.split("\n", 1)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // have we seen any char of the current record?

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    started = true;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delimiter) endField();
    else if (c === "\r") {
      /* swallow; \n ends the row */
    } else if (c === "\n") endRow();
    else field += c;
  }
  // Flush trailing field/row only if the final record had any content.
  if (started || field !== "" || row.length > 0) {
    if (started) endRow();
  }

  return rows.map((r) => r.map((cell) => cell.trim()));
}

const NAME_FULL = new Set(["name", "full name", "fullname"]);
const NAME_FIRST = new Set(["first name", "first", "firstname"]);
const NAME_LAST = new Set(["last name", "last", "lastname"]);
const COMPANY = new Set(["company", "organization", "org", "employer"]);
const URL_COL = new Set(["linkedin", "linkedin url", "url", "profile", "profile url"]);
const EMAIL_COL = new Set(["email", "e-mail", "work email", "email address"]);
const CITY_COL = new Set(["city", "town"]);
const REGION_COL = new Set(["state", "region", "province"]);
const COUNTRY_COL = new Set(["country", "nation"]);
const LOCATION_COL = new Set(["location", "based in"]);
const PHONE_COL = new Set(["phone", "phone number", "mobile", "cell", "telephone", "mobile phone", "cell phone"]);
const TITLE_COL = new Set(["title", "job title", "role", "position"]);
const HEADER_TOKENS = new Set([
  ...NAME_FULL, ...NAME_FIRST, ...NAME_LAST, ...COMPANY, ...URL_COL,
  ...EMAIL_COL, ...CITY_COL, ...REGION_COL, ...COUNTRY_COL, ...LOCATION_COL,
  ...PHONE_COL, ...TITLE_COL,
]);

const CELL_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A LinkedIn /in/ profile URL specifically (so we don't grab unrelated URLs like
// a Luma qr_code_url or a company website).
const LINKEDIN_CELL = /linkedin\.com\/in\//i;
function looksLikeLinkedin(s: string): boolean {
  return LINKEDIN_CELL.test(s);
}

// Normalize a header cell for token matching: lowercase + collapse underscores/
// hyphens to spaces so "first_name", "last-name", "linkedin_url", "work_email"
// match the space-separated tokens above (a very common export format).
function normHeader(s: string): string {
  return s.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function looksLikeUrlCell(s: string): boolean {
  return /linkedin\.com/i.test(s) || /^https?:\/\//i.test(s);
}

// Founder Festival CSV template prose rows (title / NOTE / instruction) that sit
// ABOVE the real "Full Name, Company, …" header. They have one populated cell
// of boilerplate text — strip them so an unedited template upload doesn't ingest
// them as data. (The header row itself is dropped by the header scan below.)
function isTemplateBoilerplate(cells: string[]): boolean {
  const first = (cells[0] ?? "").trim();
  if (!first) return false;
  const restEmpty = cells.slice(1).every((c) => !c.trim());
  if (!restEmpty) return false; // real header / data rows fill more than one cell
  return (
    /founder festival csv template/i.test(first) ||
    /^note:/i.test(first) ||
    /look exactly like this/i.test(first) ||
    /try whatever you'?ve got/i.test(first)
  );
}

export function csvToJobLines(text: string): string {
  const rows = parseCsv(text)
    .filter((r) => r.some((c) => c !== ""))
    .filter((r) => !isTemplateBoilerplate(r));
  if (rows.length === 0) return "";

  // Find the header row ANYWHERE (not just row 0): a template puts title/NOTE/
  // instruction rows above the real "Full Name, Company, …" header. Rows before
  // the header are dropped and the header row itself is consumed.
  const headerIdx = rows.findIndex((r) => r.some((c) => HEADER_TOKENS.has(normHeader(c))));
  const hasHeader = headerIdx >= 0;
  const header = hasHeader ? rows[headerIdx].map(normHeader) : [];

  let fullIdx = -1;
  let firstIdx = -1;
  let lastIdx = -1;
  let companyIdx = -1;
  let urlIdx = -1;
  const dataRows = hasHeader ? rows.slice(headerIdx + 1) : rows;

  if (hasHeader) {
    header.forEach((h, i) => {
      if (NAME_FULL.has(h)) fullIdx = i;
      else if (NAME_FIRST.has(h)) firstIdx = i;
      else if (NAME_LAST.has(h)) lastIdx = i;
      else if (COMPANY.has(h)) companyIdx = i;
      else if (URL_COL.has(h)) urlIdx = i;
    });
  }

  const lines: string[] = [];
  for (const r of dataRows) {
    // Prefer an explicit LinkedIn URL — from the mapped column, else any cell.
    let url = urlIdx >= 0 && looksLikeUrlCell(r[urlIdx] ?? "") ? r[urlIdx] : "";
    if (!url) url = r.find((c) => looksLikeUrlCell(c)) ?? "";
    if (url) {
      lines.push(url.trim());
      continue;
    }

    let name: string;
    let company: string;
    if (hasHeader) {
      name =
        fullIdx >= 0
          ? (r[fullIdx] ?? "")
          : [r[firstIdx] ?? "", r[lastIdx] ?? ""].filter(Boolean).join(" ");
      company = companyIdx >= 0 ? (r[companyIdx] ?? "") : "";
    } else {
      name = r[0] ?? "";
      company = r[1] ?? "";
    }
    name = name.trim();
    company = company.trim();
    if (!name) continue;
    lines.push(company ? `${name}, ${company}` : name);
  }

  return lines.join("\n");
}

// Structured CSV parse that PRESERVES email + location (unlike csvToJobLines,
// which collapses to a "Name, Company" string and loses them). Pure + DB-free so
// it stays safe in the client bundle (NewJobForm). Optional fields are omitted
// when absent (no null keys). Free-text `location` is captured as locationRaw;
// the server splits it (see toSubjectLocation) when city/state/country columns
// aren't supplied.
export type CsvRow = {
  name?: string;
  company?: string;
  linkedinUrl?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  region?: string;
  country?: string;
  locationRaw?: string;
};

export function parseCsvRows(text: string): CsvRow[] {
  const rows = parseCsv(text)
    .filter((r) => r.some((c) => c !== ""))
    .filter((r) => !isTemplateBoilerplate(r));
  if (rows.length === 0) return [];

  const headerIdx = rows.findIndex((r) => r.some((c) => HEADER_TOKENS.has(normHeader(c))));
  const hasHeader = headerIdx >= 0;
  const header = hasHeader ? rows[headerIdx].map(normHeader) : [];
  const dataRows = hasHeader ? rows.slice(headerIdx + 1) : rows;

  let fullIdx = -1, firstIdx = -1, lastIdx = -1, companyIdx = -1, urlIdx = -1;
  let emailIdx = -1, cityIdx = -1, regionIdx = -1, countryIdx = -1, locationIdx = -1;
  let phoneIdx = -1, titleIdx = -1;
  if (hasHeader) {
    header.forEach((h, i) => {
      if (NAME_FULL.has(h)) fullIdx = i;
      else if (NAME_FIRST.has(h)) firstIdx = i;
      else if (NAME_LAST.has(h)) lastIdx = i;
      else if (COMPANY.has(h)) companyIdx = i;
      else if (URL_COL.has(h)) urlIdx = i;
      else if (EMAIL_COL.has(h)) emailIdx = i;
      else if (PHONE_COL.has(h)) phoneIdx = i;
      else if (TITLE_COL.has(h)) titleIdx = i;
      else if (CITY_COL.has(h)) cityIdx = i;
      else if (REGION_COL.has(h)) regionIdx = i;
      else if (COUNTRY_COL.has(h)) countryIdx = i;
      else if (LOCATION_COL.has(h)) locationIdx = i;
    });
    // Substring fallback for verbose survey-style headers (e.g. Luma's
    // "What is your LinkedIn profile?", "What company do you work for?",
    // "Work Email Address", "What is your job title?") that no exact token
    // matched. First match wins and never overrides an exact match.
    header.forEach((h, i) => {
      if (urlIdx < 0 && h.includes("linkedin")) urlIdx = i;
      if (companyIdx < 0 && h.includes("company")) companyIdx = i;
      if (emailIdx < 0 && h.includes("email")) emailIdx = i;
      if (phoneIdx < 0 && h.includes("phone")) phoneIdx = i;
      if (titleIdx < 0 && h.includes("title")) titleIdx = i;
    });
  }

  const out: CsvRow[] = [];
  for (const r of dataRows) {
    const row: CsvRow = {};

    // LinkedIn URL: the mapped column if it's a LinkedIn /in/ URL, else scan ANY
    // cell for one. Crucially LinkedIn-specific, so an unrelated URL column (a
    // Luma qr_code_url, a company website) is never mistaken for the profile.
    let url = urlIdx >= 0 ? (r[urlIdx] ?? "").trim() : "";
    if (!looksLikeLinkedin(url)) url = (r.find((c) => looksLikeLinkedin(c)) ?? "").trim();
    if (looksLikeLinkedin(url)) row.linkedinUrl = url;

    // Capture name + company ALONGSIDE the URL (not either/or) — keep every
    // signal, and give a row with an unusable URL a name fallback.
    const name = (
      hasHeader
        ? fullIdx >= 0
          ? (r[fullIdx] ?? "")
          : [r[firstIdx] ?? "", r[lastIdx] ?? ""].filter(Boolean).join(" ")
        : (r[0] ?? "")
    ).trim();
    if (name) row.name = name;
    const company = (hasHeader ? (companyIdx >= 0 ? (r[companyIdx] ?? "") : "") : (r[1] ?? "")).trim();
    if (company) row.company = company;

    const email =
      emailIdx >= 0
        ? (r[emailIdx] ?? "").trim()
        : (r.find((c) => CELL_EMAIL.test(c.trim()))?.trim() ?? "");
    if (email) row.email = email.toLowerCase();

    if (phoneIdx >= 0 && (r[phoneIdx] ?? "").trim()) row.phone = r[phoneIdx].trim();
    if (titleIdx >= 0 && (r[titleIdx] ?? "").trim()) row.jobTitle = r[titleIdx].trim();

    if (cityIdx >= 0 && (r[cityIdx] ?? "").trim()) row.city = r[cityIdx].trim();
    if (regionIdx >= 0 && (r[regionIdx] ?? "").trim()) row.region = r[regionIdx].trim();
    if (countryIdx >= 0 && (r[countryIdx] ?? "").trim()) row.country = r[countryIdx].trim();
    if (locationIdx >= 0 && (r[locationIdx] ?? "").trim() && !row.city && !row.region && !row.country) {
      row.locationRaw = r[locationIdx].trim();
    }

    if (Object.keys(row).length === 0) continue; // fully-empty row
    out.push(row);
  }
  return out;
}
