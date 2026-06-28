import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { db } from "@/db";
import { majesticMillion } from "@/db/schema";
import { sql } from "drizzle-orm";

type Row = { rank: number; domain: string };

export async function* parseMajesticCsv(path: string): AsyncGenerator<Row> {
  const stream = createReadStream(path, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  let rankIdx = -1;
  let domainIdx = -1;
  for await (const line of rl) {
    const cells = line.split(",");
    if (!header) {
      header = cells.map((c) => c.trim());
      rankIdx = header.indexOf("GlobalRank");
      domainIdx = header.indexOf("Domain");
      if (rankIdx < 0 || domainIdx < 0) throw new Error("CSV missing GlobalRank or Domain columns");
      continue;
    }
    const rank = Number(cells[rankIdx]);
    const domain = (cells[domainIdx] || "").trim().toLowerCase();
    if (!Number.isFinite(rank) || !domain) continue;
    yield { rank, domain };
  }
}

export async function upsertBatch(rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(majesticMillion)
    .values(rows.map((r) => ({ rank: r.rank, domain: r.domain })))
    .onConflictDoUpdate({
      target: majesticMillion.rank,
      set: {
        domain: sql`EXCLUDED.domain`,
        refreshedAt: sql`NOW()`,
      },
    });
}

export async function loadCsvIntoNeon(path: string, batchSize = 5000): Promise<number> {
  let batch: Row[] = [];
  let total = 0;
  for await (const row of parseMajesticCsv(path)) {
    batch.push(row);
    if (batch.length >= batchSize) {
      await upsertBatch(batch);
      total += batch.length;
      batch = [];
      // eslint-disable-next-line no-console
      console.log(`upserted ${total} rows`);
    }
  }
  if (batch.length > 0) {
    await upsertBatch(batch);
    total += batch.length;
  }
  return total;
}
