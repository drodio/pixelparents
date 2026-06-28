import { nameMatches } from "../name-match";
import { type BrightDataCrunchbaseCompany } from "../brightdata";
import { domainHostOrNull } from "@/lib/domain-normalize";

// BrightData Crunchbase — AUTHORITATIVE company data (funding, acquisitions,
// employee scale, web traffic, app downloads, IPO status, investors) for the
// subject's company. Lands on the founder TRACTION / OPERATOR / GTM / fundraising
// vectors; data the Exa/LinkedIn text path doesn't have reliably.
//
// ARCHITECTURE: a Crunchbase collection is ~19–32s — too slow to block an eval —
// so it's ASYNC. The post-scoring trigger (crunchbase-async.ts) queues a
// collection and stores {snapshotId, slug} on the evaluation; the crunchbase-sweep
// cron downloads the ready result, CORROBORATES it as the subject's company, runs
// crunchbaseFacts(), and caches {facts} on the eval — then re-scores so the facts
// fold into the breakdown. The enricher below only EMITS those cached facts (never
// fetches live), so it's instant and re-scores are free.
//
// IDENTITY (precision over recall): a Crunchbase org slug guessed from a company
// name can resolve to the WRONG org, so the sweep only trusts a record when its
// name matches the subject's company AND it's corroborated as theirs — the
// founders list includes the subject, OR the org's website domain is in the
// subject's web footprint. Uncorroborated records are dropped.

// "Storytell.ai" → "storytell-ai", "Signal from Noise" → "signal-from-noise".
export function crunchbaseSlug(company: string): string {
  return company
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function websiteHost(website: string | null | undefined): string | null {
  return domainHostOrNull(website);
}

// Is this record corroborated as the subject's company? (founders-include-subject
// OR the org's website domain is one of the subject's known domains).
export function corroborateCompany(
  rec: BrightDataCrunchbaseCompany,
  companyName: string,
  fullName: string | null,
  subjectHosts: Set<string>,
): boolean {
  // STRONG: the org's website domain IS one of the subject's known company
  // domains. Identifying on its own (and survives a rename — e.g. the LinkedIn
  // company "Storytell" vs the Crunchbase org "Chief", same storytell.ai domain).
  const host = websiteHost(rec.website);
  if (!!host && subjectHosts.has(host)) return true;
  // Otherwise require the org NAME to match the subject's company AND the subject
  // to be in its founders list (guards a slug that resolved to a same-domain-less
  // but same-named different org).
  if (!rec.name || !nameMatches(companyName, rec.name)) return false;
  return (
    !!fullName &&
    (rec.founders ?? []).some((f) => f?.value && nameMatches(fullName, String(f.value)))
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// Render the human-readable facts the scorer reads (no point values — the model
// scores them per the CRUNCHBASE rubric section). Stored on the eval by the sweep.
export function crunchbaseFacts(rec: BrightDataCrunchbaseCompany): string[] {
  const name = rec.name ?? "the company";
  const facts: string[] = [];
  const head: string[] = [];
  if (rec.num_employees) head.push(`${rec.num_employees} employees`);
  if (rec.operating_status) head.push(rec.operating_status);
  if (rec.ipo_status && rec.ipo_status !== "private") head.push(`${rec.ipo_status} (IPO status)`);
  if (head.length) facts.push(`Crunchbase (authoritative) — ${name}: ${head.join(", ")}.`);

  if (rec.acquired_by?.acquirer) {
    facts.push(`Crunchbase: ${name} was ACQUIRED by ${rec.acquired_by.acquirer} (an exit).`);
  }
  const rounds = rec.num_funding_rounds ?? rec.financials_highlights?.num_funding_rounds;
  const fundingTotal = rec.financials_highlights?.funding_total;
  if (typeof fundingTotal === "number" && fundingTotal > 0) {
    facts.push(`Crunchbase: ${name} has raised $${fmt(fundingTotal)} total${rounds ? ` across ${rounds} rounds` : ""} (authoritative).`);
  } else if (rounds && rounds > 0) {
    facts.push(`Crunchbase: ${name} has raised across ${rounds} funding round(s) (authoritative).`);
  }
  const investors = [
    ...new Set(
      (rec.investors ?? [])
        .map((i) => (i as { value?: string | null })?.value)
        .filter((v): v is string => !!v)
        // values look like "Andreessen Horowitz investment in Series B - Acme" —
        // keep just the investor name.
        .map((v) => v.split(/\s+investment\b/i)[0]!.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (investors.length) facts.push(`Crunchbase: ${name} is backed by ${investors.join(", ")}.`);

  const visits = rec.monthly_visits ?? rec.semrush_visits_latest_month;
  if (typeof visits === "number" && visits > 0) {
    facts.push(`Crunchbase: ${name} gets ~${fmt(visits)} monthly website visits (Semrush) — distribution/traction.`);
  }
  if (typeof rec.apptopia_total_downloads === "number" && rec.apptopia_total_downloads > 0) {
    facts.push(`Crunchbase: ${name}'s app has ${fmt(rec.apptopia_total_downloads)} total downloads (Apptopia) — product traction.`);
  }
  return facts;
}
