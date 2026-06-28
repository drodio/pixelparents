/**
 * Seed doc_pages from content/docs/*.md. Idempotent + no-clobber: a page that a
 * human (or a published suggestion) has edited is left untouched; only absent or
 * still-seed-owned rows are (re)written from the file. Run after the migration.
 *
 * Self-contained (raw neon, same URL fallback as apply-docs-migration.ts) so it
 * works against a prod env file that only populates POSTGRES_URL_NON_POOLING —
 * NOT via @/db, which reads only DATABASE_URL.
 *
 * Dev:  DOTENV_CONFIG_PATH=.env.local      npx tsx --require dotenv/config scripts/seed-docs.ts
 * Prod: DOTENV_CONFIG_PATH=.env.prod.local npx tsx --require dotenv/config scripts/seed-docs.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { DOCS_NAV } from "../src/lib/docs-nav";

const url =
  process.env.APPLY_DB_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
if (!url) throw new Error("No DB URL (set APPLY_DB_URL or load an env file with DOTENV_CONFIG_PATH).");
const sql = neon(url);

async function main() {
  console.log(`Seeding doc_pages on host: ${new URL(url!).host}`);
  const dir = join(process.cwd(), "content", "docs");
  let wrote = 0;
  let kept = 0;
  for (let i = 0; i < DOCS_NAV.length; i++) {
    const item = DOCS_NAV[i]!;
    if (item.kind !== "doc") continue; // support page has no markdown row
    const bodyMd = readFileSync(join(dir, `${item.slug}.md`), "utf8");
    // Upsert, but the conditional ON CONFLICT WHERE leaves a human/suggestion
    // edit (updated_by != 'seed') untouched — no insert (conflict) and no update.
    const res = await sql.query(
      `INSERT INTO doc_pages (slug, title, emoji, nav_order, body_md, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'seed')
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             emoji = EXCLUDED.emoji,
             nav_order = EXCLUDED.nav_order,
             body_md = EXCLUDED.body_md,
             updated_at = now(),
             updated_by = 'seed'
         WHERE doc_pages.updated_by = 'seed'
       RETURNING slug`,
      [item.slug, item.label, item.emoji, i, bodyMd],
    );
    const didWrite = ((res as unknown as { rows?: unknown[] }).rows ?? res).length > 0;
    if (didWrite) {
      wrote++;
      console.log(`seeded  ${item.slug}`);
    } else {
      kept++;
      console.log(`kept    ${item.slug} (human/suggestion edit preserved)`);
    }
  }
  console.log(`Done. ${wrote} written, ${kept} preserved.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
