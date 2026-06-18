// Auto-generate changelog entries from git commits via an LLM, with a strict
// no-PII prompt. Idempotent on commit SHA. Dormant until ANTHROPIC_API_KEY is
// set, so it's safe to wire up before the key exists.
//
//   node -r dotenv/config scripts/build-changelog.mjs            # new entries (will email)
//   node -r dotenv/config scripts/build-changelog.mjs --backfill # mark as already-notified
//
// Env: DATABASE_URL, ANTHROPIC_API_KEY (or AI_GATEWAY_API_KEY), CHANGELOG_MODEL.
import { neon } from "@neondatabase/serverless";
import { execSync } from "node:child_process";

const BACKFILL = process.argv.includes("--backfill");
// Prefer the Vercel AI Gateway (one key → many models, billed via Vercel);
// fall back to a direct Anthropic key if that's all that's set.
const GW_KEY = process.env.VERCEL_AI_GATEWAY || process.env.AI_GATEWAY_API_KEY;
const ANT_KEY = process.env.ANTHROPIC_API_KEY;
const USE_GATEWAY = Boolean(GW_KEY);
const MODEL =
  process.env.CHANGELOG_MODEL ||
  (USE_GATEWAY ? "anthropic/claude-haiku-4-5" : "claude-haiku-4-5-20251001");

const VALID_TYPES = ["feature", "enhancement", "bug_fix"];
const VALID_CATS = [
  "signup", "profiles", "sharing", "photos", "admin", "developers",
  "email", "security", "performance", "infrastructure", "design",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — aborting.");
  process.exit(1);
}
if (!GW_KEY && !ANT_KEY) {
  console.warn("No VERCEL_AI_GATEWAY / ANTHROPIC_API_KEY — generator is dormant. Exiting cleanly.");
  process.exit(0);
}

const sql = neon(process.env.DATABASE_URL);

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Meaningful commits only (conventional-commit-ish prefixes).
function meaningfulCommits() {
  const raw = execSync(
    'git log --no-merges --pretty=format:"%H%x09%ad%x09%s" --date=iso-strict -n 200',
    { encoding: "utf8" },
  ).trim();
  return raw
    .split("\n")
    .map((l) => {
      const [sha, date, ...rest] = l.split("\t");
      return { sha, date, subject: rest.join("\t") };
    })
    .filter((c) => /^(feat|fix|perf|refactor|ux|security|sec)(\(|:|!)/i.test(c.subject));
}

async function llmEntry(commit) {
  const prompt = `You write a single public product-changelog entry for a commit on "Pixel Parents", an OHS-parents open-source app.

STRICT RULES:
- NO PII: never include real people's names, children's names, emails, phone numbers, addresses, or company names. Describe capabilities generically ("a parent", "a child").
- Benefit-focused, plain language. No internal jargon, file names, or SHAs.
- changeType ∈ ${JSON.stringify(VALID_TYPES)}; categories ⊆ ${JSON.stringify(VALID_CATS)} (0-3).

Commit subject: ${commit.subject}

Respond with ONLY JSON: {"title": "...", "summary": "1-2 sentences", "bullets": ["..."], "changeType": "...", "categories": ["..."]}`;

  let text;
  if (USE_GATEWAY) {
    // Vercel AI Gateway — OpenAI-compatible chat completions.
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${GW_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`AI Gateway ${res.status}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    text = data.choices?.[0]?.message?.content ?? "";
  } else {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANT_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json();
    text = data.content?.[0]?.text ?? "";
  }
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!json.title || !json.summary) throw new Error("LLM omitted title/summary");
  return {
    title: String(json.title).slice(0, 200),
    summary: String(json.summary).slice(0, 1000),
    bullets: Array.isArray(json.bullets) ? json.bullets.slice(0, 4).map((b) => String(b)) : [],
    changeType: VALID_TYPES.includes(json.changeType) ? json.changeType : "enhancement",
    categories: Array.isArray(json.categories)
      ? json.categories.filter((c) => VALID_CATS.includes(c)).slice(0, 3)
      : [],
  };
}

const existing = await sql`SELECT commit_sha FROM changelog_entries WHERE commit_sha IS NOT NULL`;
const seen = new Set(existing.map((r) => r.commit_sha));

let added = 0;
for (const c of meaningfulCommits()) {
  if (seen.has(c.sha)) continue;
  try {
    const e = await llmEntry(c);
    await sql`
      INSERT INTO changelog_entries (slug, shipped_at, title, summary, bullets, change_type, categories, commit_sha, notified_at)
      VALUES (${`${c.sha.slice(0, 7)}-${slugify(e.title) || "change"}`}, ${c.date}, ${e.title}, ${e.summary},
        ${JSON.stringify(e.bullets)}::jsonb, ${e.changeType}, ${JSON.stringify(e.categories)}::jsonb,
        ${c.sha}, ${BACKFILL ? new Date().toISOString() : null})
      ON CONFLICT (commit_sha) DO NOTHING
    `;
    added++;
    console.log(`+ ${e.title}`);
  } catch (err) {
    console.error(`skip ${c.sha.slice(0, 7)}: ${err.message}`);
  }
}
console.log(`Done. Added ${added} entr${added === 1 ? "y" : "ies"}${BACKFILL ? " (backfill, not emailed)" : ""}.`);
