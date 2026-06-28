/**
 * build-changelog.ts — generate curated /changelog entries from git history.
 *
 * Reads meaningful commits on the current branch, asks the AI Gateway (Haiku) to
 * write a human-legible, benefit-oriented changelog entry for each — with hard
 * rules to NEVER expose PII or specific scoring point values — and upserts them
 * into the changelog_entries table (idempotent on commit_sha).
 *
 *   DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config scripts/build-changelog.ts [limit]
 *
 * `limit` (default 140) caps how many recent meaningful commits to process.
 * Backfilled entries are marked notified (notified_at=now) so they never email.
 */
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { generateText } from "ai";
import { changelogEntries } from "../src/db/schema";

const DB_URL =
  process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || "";
if (!DB_URL) throw new Error("DATABASE_URL not set (use DOTENV_CONFIG_PATH=.env.local)");
const db = drizzle(neon(DB_URL));

const MODEL = "anthropic/claude-haiku-4-5";
const LIMIT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 140;
const BATCH = 8;
// --backfill marks every inserted entry already-notified (the one-time historical
// import must never email). Without it (the per-commit/ongoing path), new entries
// are left un-notified so notifyNewChangelogEntries() emails subscribers.
const BACKFILL = process.argv.includes("--backfill");

// Commits worth a changelog line. Skip pure plumbing unless it's notable.
const MEANINGFUL = /^(feat|fix|ux|perf|refactor|security|sec)(\(|:|!)/i;

type Commit = { sha: string; dateIso: string; subject: string; body: string };

function readCommits(): Commit[] {
  const RS = "\x1e";
  const FS = "\x1f";
  const raw = execSync(
    `git log --no-merges --pretty=format:'%H${FS}%cI${FS}%s${FS}%b${RS}' -n 600`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return raw
    .split(RS)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, dateIso, subject, body = ""] = r.split(FS);
      return { sha: sha!.trim(), dateIso: dateIso!.trim(), subject: subject!.trim(), body: body.trim() };
    })
    .filter((c) => MEANINGFUL.test(c.subject))
    .slice(0, LIMIT);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const SYSTEM = `You write the PUBLIC changelog for "Founder Festival", a product that scores founders and investors and runs IRL events. Turn raw git commits into short, human, benefit-oriented entries a non-engineer can read.

Output ONLY a JSON array — one object per commit, SAME order as given:
{ "commit": "<sha>", "title": string, "summary": string, "bullets": string[], "changeType": "feature"|"enhancement"|"bug_fix", "categories": string[] }

- title: a short, plain-English headline about the user benefit (NOT the raw commit subject).
- summary: 1-2 sentences on WHAT shipped and WHY it matters.
- bullets: 0-4 short specifics (may be empty).
- changeType: "feature" (new capability), "enhancement" (improves existing), or "bug_fix".
- categories: a subset of EXACTLY these slugs: ["scoring_rubric","profiles","leaderboard","events","admin","api","pipeline","security","performance","infrastructure","design"]. Pick 1-3.

HARD RULES (never violate):
1. NO PII. Never include a specific person's name, email, company, or LinkedIn handle — not even ones in the commit. Say "a founder", "some profiles", "a high-profile user".
2. NO specific scoring numbers. Never state point values, score thresholds, or exact rubric weights. For scoring changes, describe the DATA SOURCES and the APPROACH generally — e.g. "added a new data source to deepen technical-depth signals", "now corroborates a person's identity across more sources", "complements existing signals with press/recognition data" — never "+8 points" or "caps at 200".
3. Be honest and specific about capability, but legible to a non-engineer.`;

async function curate(batch: Commit[]): Promise<Map<string, { title: string; summary: string; bullets: string[]; changeType: string; categories: string[] }>> {
  const prompt =
    "Write one entry per commit:\n\n" +
    batch
      .map(
        (c, i) =>
          `${i + 1}. commit ${c.sha.slice(0, 10)}\nsubject: ${c.subject}\nbody: ${c.body.slice(0, 600).replace(/\n+/g, " ")}`,
      )
      .join("\n\n");
  const { text } = await generateText({ model: MODEL, system: SYSTEM, prompt, temperature: 0.4 });
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const arr = JSON.parse(json) as Array<{ commit: string; title: string; summary: string; bullets?: string[]; changeType: string; categories?: string[] }>;
  const out = new Map<string, { title: string; summary: string; bullets: string[]; changeType: string; categories: string[] }>();
  for (const e of arr) {
    const match = batch.find((c) => c.sha.startsWith(e.commit) || e.commit.startsWith(c.sha.slice(0, 10)));
    if (match) {
      out.set(match.sha, {
        title: e.title,
        summary: e.summary,
        bullets: (e.bullets ?? []).slice(0, 4),
        changeType: ["feature", "enhancement", "bug_fix"].includes(e.changeType) ? e.changeType : "enhancement",
        categories: (e.categories ?? []).slice(0, 3),
      });
    }
  }
  return out;
}

async function main() {
  const all = readCommits();
  // Skip commits already in the changelog BEFORE spending any LLM calls — makes
  // the per-commit hook a near-instant no-op when there's nothing new.
  const existing = new Set(
    (await db.select({ sha: changelogEntries.commitSha }).from(changelogEntries)).map((r) => r.sha),
  );
  const commits = all.filter((c) => !existing.has(c.sha));
  if (commits.length === 0) {
    console.log("Changelog up to date — nothing new to curate.");
    return;
  }
  console.log(`Found ${commits.length} new meaningful commits to curate (of ${all.length} scanned).`);
  let inserted = 0;
  for (let i = 0; i < commits.length; i += BATCH) {
    const batch = commits.slice(i, i + BATCH);
    let curated: Awaited<ReturnType<typeof curate>>;
    try {
      curated = await curate(batch);
    } catch (err) {
      console.warn(`  batch ${i / BATCH} failed, skipping:`, (err as Error).message);
      continue;
    }
    for (const c of batch) {
      const e = curated.get(c.sha);
      if (!e) continue;
      const slug = `${c.sha.slice(0, 7)}-${slugify(e.title)}`;
      await db
        .insert(changelogEntries)
        .values({
          slug,
          shippedAt: new Date(c.dateIso),
          title: e.title,
          summary: e.summary,
          bullets: e.bullets,
          changeType: e.changeType,
          categories: e.categories,
          commitSha: c.sha,
          notifiedAt: BACKFILL ? new Date() : null,
        })
        .onConflictDoNothing({ target: changelogEntries.commitSha });
      inserted++;
    }
    console.log(`  …${Math.min(i + BATCH, commits.length)}/${commits.length}`);
  }
  const rows = await db.select({ c: sql<number>`count(*)::int` }).from(changelogEntries);
  console.log(`Done. Processed ${inserted}; table now holds ${rows[0]?.c ?? "?"} entries.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
