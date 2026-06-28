import type { EnricherContext, EnrichmentResult } from "./types";
import { searchPatentsByInventor, type UsptoPatent } from "../uspto";

// USPTO patents enricher — granted/filed US patents naming the subject as an
// inventor = TECHNICAL / domain depth (they build real, novel technology).
//
// IDENTITY (precision over recall): the USPTO search is by SURNAME (forms vary —
// "Daniel R. Odio" vs "Daniel Odio", "Sam" vs "Samuel"), so we re-filter here:
//   (a) the inventor's FIRST + LAST name must match the subject (strict), AND
//   (b) the patent's ASSIGNEE company must appear in the subject's own research
//       text (LinkedIn + search highlights) — which spans their WHOLE career, so
//       a patent assigned to a PAST employer (e.g. Sam Odio's Facebook patents,
//       DROdio's Armory patents) still corroborates. A patent with no assignee, or
//       an assignee absent from their research, is dropped.

const GENERIC_CO = new Set([
  "inc", "llc", "ltd", "corp", "corporation", "company", "co", "the", "and",
  "technologies", "technology", "systems", "labs", "lab", "group", "holdings",
  "international", "global", "ventures", "partners", "limited", "gmbh", "plc",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Subject's first + last name (handles BrightData's "Nick - Real Name" form).
export function subjectFirstLast(fullName: string): { first: string; last: string } | null {
  const real = fullName.includes(" - ") ? fullName.split(" - ").pop()! : fullName;
  const t = real.toLowerCase().split(/\s+/).map((x) => x.replace(/[^a-z]/g, "")).filter((x) => x.length >= 2);
  if (t.length < 2) return null;
  return { first: t[0]!, last: t[t.length - 1]! };
}

// Strict: the inventor's name must carry the subject's last name (exact token) AND
// their first name (prefix either way → handles Sam↔Samuel, Dan↔Daniel, initials).
export function inventorIsSubject(fullName: string, inventorName: string): boolean {
  const s = subjectFirstLast(fullName);
  if (!s) return false;
  const inv = tokens(inventorName);
  const lastOk = inv.includes(s.last);
  const firstOk = inv.some((t) => t.length >= 2 && (t.startsWith(s.first) || s.first.startsWith(t)));
  return lastOk && firstOk;
}

// A patent is the subject's iff the inventor matches AND a DISTINCTIVE assignee
// token appears in their research text (their career companies).
export function corroboratePatent(p: UsptoPatent, fullName: string, researchText: string): boolean {
  if (!p.inventors.some((i) => inventorIsSubject(fullName, i))) return false;
  const assigneeTokens = tokens(p.applicant ?? "").filter((t) => t.length >= 4 && !GENERIC_CO.has(t));
  if (assigneeTokens.length === 0) return false; // no corroborating assignee → drop
  return assigneeTokens.some((t) => researchText.includes(t));
}

export function patentFacts(patents: UsptoPatent[]): string[] {
  if (patents.length === 0) return [];
  const granted = patents.filter((p) => p.granted).length;
  const top = patents.find((p) => p.granted) ?? patents[0]!;
  const assignee = top.applicant ?? "their company";
  const grantedClause = granted > 0 ? `${granted} granted` : "filed";
  return [
    `Named inventor on ${patents.length} US patent(s) (${grantedClause}), assigned to ${assignee} — e.g. "${(top.title ?? "").slice(0, 80)}". A deep TECHNICAL / domain-invention signal.`,
  ];
}

// Pick the name to search USPTO with. `ctx.fullName` is derived live and can be a
// vanity LinkedIn handle ("DROdio") that has no separable first/last — useless for a
// surname search. `ctx.knownFullName` is the eval's prior LLM-extracted legal name
// ("Daniel Rubén Odio"), present on re-scores. Prefer the first candidate that parses
// into a real first+last; fall back to the raw live name so first scores still try.
export function resolvePatentName(ctx: EnricherContext): string | null {
  const candidates = [ctx.fullName, ctx.knownFullName].filter((n): n is string => !!n && n.trim().length > 0);
  return candidates.find((n) => subjectFirstLast(n) !== null) ?? candidates[0] ?? null;
}

export async function enrichWithPatents(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "patents", facts: [], citations: [] };
  const subjectName = resolvePatentName(ctx);
  if (!process.env.USPTO_API_KEY || !subjectName) return empty;

  // The subject's WHOLE-career research text — assignees are matched against this,
  // so patents from PAST employers still corroborate.
  const researchText = (
    ctx.linkedinPageText +
    " " +
    (ctx.searchHighlights ?? []).map((h) => `${h.title ?? ""} ${(h.highlights ?? []).join(" ")}`).join(" ")
  ).toLowerCase();

  try {
    const all = await searchPatentsByInventor(subjectName);
    if (!all || all.length === 0) return empty;
    const mine = all.filter((p) => corroboratePatent(p, subjectName, researchText));
    const facts = patentFacts(mine);
    if (facts.length === 0) return empty;
    return {
      source: "patents",
      facts,
      citations: ["https://ppubs.uspto.gov/pubwebapp/"],
      raw: mine.slice(0, 12),
    };
  } catch {
    return empty;
  }
}
