// Backfill evaluations.founder_status for profiles scored before the column
// existed, AND ensure the column exists (idempotent ADD COLUMN IF NOT EXISTS).
// Low-signal rows are set to 'never' deterministically; scored rows are labeled
// by a cheap Haiku pass over their ALREADY-STORED data (no re-score).
//
// Idempotent + safe to re-run (only touches rows where founder_status IS NULL).
//
//   # Against the dev DB (default):
//   npx tsx scripts/backfill-founder-status.ts --target=dev
//   # Against prod (loads .env.prod.local for the DB url + AI key itself):
//   npx tsx scripts/backfill-founder-status.ts --target=prod
//
// Env knobs: LIMIT (cap scored rows, for testing), CONCURRENCY (default 6).
import { readFileSync } from "node:fs";

// --- Self-contained env load (so the command carries no secrets and the DB
// client picks up the right url before it is imported). If DATABASE_URL is
// already set, we respect it and skip file loading. ---
const target = (process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "dev") as
  | "dev"
  | "prod";
if (!process.env.DATABASE_URL) {
  const file =
    target === "prod"
      ? "/Users/drodio/Projects/founder-festival/.env.prod.local"
      : "/Users/drodio/Projects/founder-festival/.env.local";
  const env = readFileSync(file, "utf8");
  const pick = (k: string) => {
    const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  process.env.DATABASE_URL =
    pick("DATABASE_URL") || pick("POSTGRES_URL_NON_POOLING") || pick("POSTGRES_URL") || pick("DATABASE_URL_UNPOOLED");
  // Load remaining keys (AI_GATEWAY_API_KEY etc.) without overriding existing.
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (v && !process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

async function main() {
  const { db } = await import("@/db");
  const { evaluations } = await import("@/db/schema");
  const { and, eq, isNull, ne, or, sql } = await import("drizzle-orm");
  const { classifyStatuses } = await import("@/lib/founder-status-classify");

  console.log(`target=${target} host=${new URL(process.env.DATABASE_URL!).host.split(".")[0]}`);

  // 0) Ensure the columns exist (idempotent — matches migrations 0034/0035).
  await db.execute(sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS founder_status text`);
  await db.execute(sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS investor_status text`);

  type Row = typeof evaluations.$inferSelect;
  const summarize = (row: Row): string => {
    const p = (row.profile ?? {}) as Record<string, unknown>;
    const id = (p.identity ?? {}) as Record<string, unknown>;
    const em = (p.extractedMetrics ?? {}) as Record<string, unknown>;
    const bd = (row.breakdown as { founder?: { points: number; reason: string }[] } | null)?.founder ?? [];
    const lines: string[] = [];
    lines.push(`Name: ${row.fullName ?? (p.fullName as string) ?? "?"}`);
    if (id.headline) lines.push(`Headline: ${id.headline}`);
    if (id.role || id.company) lines.push(`Current role: ${[id.role, id.company].filter(Boolean).join(" @ ")}`);
    if (em.companiesFounded != null) lines.push(`Companies founded (extracted): ${em.companiesFounded}`);
    if (em.exitCount != null) lines.push(`Exits: ${em.exitCount}`);
    if (em.hadAcquisition) lines.push(`Had an acquisition: yes`);
    if (em.ycBatch) lines.push(`YC batch: ${em.ycBatch}`);
    if (em.partnerAtFirm) lines.push(`Partner at firm (investing): ${em.partnerAtFirm}`);
    if (em.isAngelInvestor) lines.push(`Angel investor: yes`);
    if (em.totalDeployedUsd != null) lines.push(`Capital deployed as investor (USD): ${em.totalDeployedUsd}`);
    const stages = (p.investorStageFocus ?? row.investorStageFocus) as string[] | undefined;
    if (Array.isArray(stages) && stages.length) lines.push(`Investor stage focus: ${stages.join(", ")}`);
    const reasons = bd.slice(0, 6).map((r) => `- ${r.reason}`);
    if (reasons.length) lines.push(`Founder evidence:\n${reasons.join("\n")}`);
    const inv = (row.breakdown as { investor?: { points: number; reason: string }[] } | null)?.investor ?? [];
    const invReasons = inv.slice(0, 5).map((r) => `- ${r.reason}`);
    if (invReasons.length) lines.push(`Investor evidence:\n${invReasons.join("\n")}`);
    return lines.join("\n").slice(0, 2500);
  };

  // 1) Low-signal → 'never' for both (deterministic). Set each column only
  // where it's still null, so a re-run after adding investor_status fills it.
  const lowF = await db.update(evaluations).set({ founderStatus: "never" })
    .where(and(eq(evaluations.signalQuality, "low"), isNull(evaluations.founderStatus))).returning({ id: evaluations.id });
  const lowI = await db.update(evaluations).set({ investorStatus: "never" })
    .where(and(eq(evaluations.signalQuality, "low"), isNull(evaluations.investorStatus))).returning({ id: evaluations.id });
  console.log(`low-signal set to 'never': founder=${lowF.length} investor=${lowI.length}`);

  // 2) Scored rows missing EITHER status → classify both with one Haiku call,
  // set whichever column is still null (so founder isn't overwritten on re-run).
  const limit = Number(process.env.LIMIT ?? 0);
  const scored = await db
    .select()
    .from(evaluations)
    .where(and(ne(evaluations.signalQuality, "low"), or(isNull(evaluations.founderStatus), isNull(evaluations.investorStatus))))
    .orderBy(sql`random()`)
    .limit(limit > 0 ? limit : 100000);
  console.log(`scored rows to classify: ${scored.length}`);

  const CONC = Number(process.env.CONCURRENCY ?? 6);
  let done = 0;
  const tally = { founder: { current: 0, past: 0, never: 0 }, investor: { current: 0, past: 0, never: 0 } };
  let cursor = 0;
  async function worker() {
    while (cursor < scored.length) {
      const row = scored[cursor++]!;
      // Thin/unparseable → 'never' (a re-score fixes it).
      let res: { founder: "current" | "past" | "never"; investor: "current" | "past" | "never" } = { founder: "never", investor: "never" };
      try {
        const c = await classifyStatuses(summarize(row));
        res = { founder: c.founder ?? "never", investor: c.investor ?? "never" };
      } catch (e) {
        console.error(`  err ${row.slug ?? row.id}: ${(e as Error).message}`);
      }
      const set: { founderStatus?: typeof res.founder; investorStatus?: typeof res.investor } = {};
      if (row.founderStatus == null) { set.founderStatus = res.founder; tally.founder[res.founder]++; }
      if (row.investorStatus == null) { set.investorStatus = res.investor; tally.investor[res.investor]++; }
      if (Object.keys(set).length) await db.update(evaluations).set(set).where(eq(evaluations.id, row.id));
      if (++done % 50 === 0) console.log(`  ${done}/${scored.length}  ${JSON.stringify(tally)}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  console.log(`\nDONE. ${done} classified. tally=${JSON.stringify(tally)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
