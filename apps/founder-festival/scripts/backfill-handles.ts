/* One-off: re-validate stored LinkedIn handles with the new name-validated
 * resolver. REPORT ONLY — never mutates (a wrong handle means the score was
 * computed against the wrong person, so the right fix is a re-score, not a URL
 * swap). Run: npx tsx scripts/backfill-handles.ts [sample|scan]
 *
 * `sample` (default): a curated mix of known-good + suspect profiles, to confirm
 *   the validator does NOT over-reject correct handles.
 * `scan`: re-resolve the heuristic-suspect bucket and list genuinely-wrong ones.
 */
import { config } from "dotenv";
config({ path: "/Users/drodio/Projects/founder-festival/.env.prod.local" });

import { neon } from "@neondatabase/serverless";
import { resolveLinkedinUrl } from "../src/lib/find-linkedin-handle";

const sql = neon(process.env.POSTGRES_URL_NON_POOLING!);

function companyNameFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  const root = domain.toLowerCase().replace(/^www\./, "").split(".")[0];
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : null;
}
function handleOf(url: string): string {
  return (url || "").replace(/.*\/in\//, "").replace(/\/.*$/, "");
}
function tokens(name: string): string[] {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length > 2);
}
// Crude bucket (handle-token heuristic) only used to SELECT a sample to test.
function bucket(name: string, url: string): "good" | "suspect" {
  let h = handleOf(url).toLowerCase();
  try { h = decodeURIComponent(h); } catch { /* keep */ }
  const t = tokens(name);
  if (t.length === 0) return "good";
  return t.some((tok) => h.includes(tok)) ? "good" : "suspect";
}

async function main() {
  const mode = process.argv[2] ?? "sample";
  const rows = (await sql`
    select id::text, full_name, linkedin_url, (profile->>'primaryCompanyDomain') as domain
    from evaluations where full_name is not null and linkedin_url is not null
  `) as { id: string; full_name: string; linkedin_url: string; domain: string | null }[];

  const good = rows.filter((r) => bucket(r.full_name, r.linkedin_url) === "good");
  const suspect = rows.filter((r) => bucket(r.full_name, r.linkedin_url) === "suspect");

  const pick = mode === "scan"
    ? suspect
    : [...good.slice(0, 8), ...suspect.slice(0, 8)];

  let overRejected = 0, replaced = 0, kept = 0;
  for (const r of pick) {
    const company = companyNameFromDomain(r.domain) ?? undefined;
    const { url } = await resolveLinkedinUrl(r.full_name, company);
    const stored = handleOf(r.linkedin_url);
    const now = url ? handleOf(url) : null;
    const b = bucket(r.full_name, r.linkedin_url);
    let verdict: string;
    if (now === null) { verdict = b === "good" ? "⚠️ OVER-REJECTED" : "rejected (no match)"; if (b === "good") overRejected++; }
    else if (now === stored) { verdict = "kept"; kept++; }
    else { verdict = "would replace"; replaced++; }
    console.log(`[${b}] ${r.full_name.padEnd(24)} stored=${stored.padEnd(28)} now=${(now ?? "(null)").padEnd(28)} ${verdict}`);
  }
  console.log(`\n--- ${pick.length} checked · kept=${kept} replaced=${replaced} over-rejected(good)=${overRejected} ---`);
}
main().catch((e) => { console.error(e); process.exit(1); });
