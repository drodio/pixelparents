/**
 * suggest-docs.ts — propose /docs page updates from recent git history.
 *
 * Runs after the changelog step in the ship pipeline (changelog-sync.yml). For
 * each doc page, asks the AI Gateway (Haiku) whether the newly-shipped commits
 * change anything a PUBLIC user should know about that page; if so, it writes a
 * PENDING doc_page_suggestions row (full proposed markdown + rationale) for a
 * super-admin to review + publish on the page. It NEVER edits doc_pages directly.
 *
 *   DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config scripts/suggest-docs.ts [limit]
 *
 * No-ops cleanly without DATABASE_URL or AI_GATEWAY_API_KEY (same guard posture
 * as build-changelog).
 */
import { execSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { generateText } from "ai";
import { docPages, docPageSuggestions } from "../src/db/schema";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || "";
if (!DB_URL) {
  console.log("suggest-docs: no DATABASE_URL — skipping.");
  process.exit(0);
}
if (!process.env.AI_GATEWAY_API_KEY) {
  console.log("suggest-docs: no AI_GATEWAY_API_KEY — skipping.");
  process.exit(0);
}
const db = drizzle(neon(DB_URL));

const MODEL = "anthropic/claude-haiku-4-5";
const LIMIT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 40;
const MEANINGFUL = /^(feat|fix|ux|perf|refactor|security|sec)(\(|:|!)/i;

type Commit = { sha: string; subject: string; body: string };

function readCommits(): Commit[] {
  const RS = "\x1e";
  const FS = "\x1f";
  const raw = execSync(`git log --no-merges --pretty=format:'%H${FS}%s${FS}%b${RS}' -n 300`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return raw
    .split(RS)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject, body = ""] = r.split(FS);
      return { sha: sha!.trim(), subject: subject!.trim(), body: body.trim() };
    })
    .filter((c) => MEANINGFUL.test(c.subject))
    .slice(0, LIMIT);
}

// Same hard public-safety contract as build-changelog's SYSTEM prompt.
const SYSTEM = `You maintain the PUBLIC documentation for "Founder Festival", a product that scores founders/investors and runs IRL events. You are given recently-shipped git commits plus the CURRENT markdown of one documentation page. Decide whether anything a PUBLIC, non-engineer user should know about THIS page has changed, and if so produce an updated version of the page.

HARD RULES (non-negotiable):
- NEVER expose PII, internal names, secrets, API routes, file paths, or admin-only mechanics.
- NEVER state specific scoring point values, score thresholds, rubric weights, or exact formulas. Describe scoring qualitatively only.
- Public-friendly, benefit-oriented voice. Preserve the page's existing structure, headings, and tone. Make the SMALLEST change that reflects the shipped work — do not rewrite wholesale.
- Only propose a change if a shipped commit genuinely affects what a user does or sees on this page. Most commits affect NO page.

Output ONLY a single JSON object (no prose, no code fences):
{ "changed": boolean, "proposed_md": string, "rationale": string }
- changed: true only if this page should be updated.
- proposed_md: the FULL updated markdown for the page (only when changed=true; else "").
- rationale: one short sentence on what changed and why (only when changed=true; else "").`;

async function main() {
  const commits = readCommits();
  if (commits.length === 0) {
    console.log("suggest-docs: no meaningful commits in range — nothing to do.");
    return;
  }
  const headSha = commits[0]!.sha; // representative key: one suggestion set per ship head

  const pages = await db.select().from(docPages);
  if (pages.length === 0) {
    console.log("suggest-docs: no doc pages seeded — skipping.");
    return;
  }

  const digest = commits
    .map((c) => `- ${c.subject}${c.body ? `\n  ${c.body.split("\n").slice(0, 3).join(" ")}` : ""}`)
    .join("\n");

  let proposed = 0;
  for (const page of pages) {
    // Idempotent: skip a page that already has a suggestion for this ship head.
    const [dupe] = await db
      .select({ id: docPageSuggestions.id })
      .from(docPageSuggestions)
      .where(and(eq(docPageSuggestions.slug, page.slug), eq(docPageSuggestions.sourceCommit, headSha)))
      .limit(1);
    if (dupe) continue;

    const prompt = `PAGE: ${page.slug} ("${page.title}")\n\nCURRENT MARKDOWN:\n${page.bodyMd}\n\nRECENTLY SHIPPED COMMITS:\n${digest}`;
    let result: { changed: boolean; proposed_md: string; rationale: string };
    try {
      const { text } = await generateText({ model: MODEL, system: SYSTEM, prompt, temperature: 0.3 });
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      result = JSON.parse(json);
    } catch (err) {
      console.warn(`  ${page.slug}: model/parse failed — skipping:`, (err as Error).message);
      continue;
    }
    if (!result.changed || !result.proposed_md?.trim()) continue;

    await db
      .insert(docPageSuggestions)
      .values({
        slug: page.slug,
        proposedMd: result.proposed_md,
        rationale: result.rationale ?? "",
        sourceCommit: headSha,
        status: "pending",
      })
      .onConflictDoNothing({ target: [docPageSuggestions.slug, docPageSuggestions.sourceCommit] });
    proposed++;
    console.log(`  proposed update for ${page.slug}`);
  }
  console.log(`suggest-docs: done. ${proposed} suggestion(s) written for ship ${headSha.slice(0, 7)}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
