// Generate Chief personalized learnings for EVERY matched attendee of one event
// and store them, so they show in the admin attendee table (expandable rows).
// Self-contained: Chief creds from .env.local, prod DB from .env.prod.local.
// Idempotent/resumable: creates the table if missing and skips attendees that
// already have a stored result.
//
//   node scripts/generate-personalized-for-event.cjs <eventId> [--ai]
//
// Default backend is Chief (research). Pass --ai to use the AI Gateway instead
// (not implemented here; Chief only for this batch).
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" }); // CHIEF_API_TOKEN / CHIEF_PROJECT_ID
const { neon } = require("@neondatabase/serverless");

const EVENT_ID = process.argv[2];
if (!EVENT_ID) {
  console.error("Usage: node scripts/generate-personalized-for-event.cjs <eventId>");
  process.exit(1);
}

// Prod DB string straight from the prod env file (its DATABASE_URL* are redacted;
// the Neon POSTGRES_URL_NON_POOLING is populated).
const prodPath = "/Users/drodio/Projects/founder-festival/.env.prod.local";
const prodEnv = require("dotenv").parse(fs.readFileSync(prodPath));
const DB_URL =
  prodEnv.POSTGRES_URL_NON_POOLING || prodEnv.DATABASE_URL_UNPOOLED || prodEnv.POSTGRES_URL || prodEnv.DATABASE_URL;
if (!DB_URL) { console.error("No prod Postgres URL in", prodPath); process.exit(1); }

const CHIEF_TOKEN = process.env.CHIEF_API_TOKEN;
const CHIEF_PROJECT = process.env.CHIEF_PROJECT_ID;
if (!CHIEF_TOKEN || !CHIEF_PROJECT) { console.error("CHIEF_API_TOKEN / CHIEF_PROJECT_ID missing in .env.local"); process.exit(1); }

const LOG = path.join(__dirname, ".personalized-progress.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n"); } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = neon(DB_URL);

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
// Light sanitize for stored HTML (Chief is told to return clean HTML).
function sanitize(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "")
    .replace(/ on[a-z]+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

async function buildPrompt(evalId, event) {
  const [e] = await sql`
    SELECT full_name, credibility_title, score, founder_score, investor_score,
           founder_status, investor_status, company_stage, recommendations, manual_profile_hint
    FROM evaluations WHERE id = ${evalId} LIMIT 1`;
  if (!e) return null;
  const items = await sql`
    SELECT rubric, reason, points FROM score_items WHERE evaluation_id = ${evalId} ORDER BY sort_order ASC`;
  const [nick] = await sql`SELECT nickname FROM users WHERE evaluation_id = ${evalId} AND nickname IS NOT NULL LIMIT 1`;
  const firstName = (nick && nick.nickname && nick.nickname.trim())
    || (e.full_name || "").trim().split(/\s+/)[0] || "there";
  const recSummary = (e.recommendations && e.recommendations.summary) || "";

  const summary = [
    `Name: ${e.full_name || "Unknown"}`,
    e.credibility_title ? `Headline: ${e.credibility_title}` : "",
    `Festival scores — combined ${e.score}, founder ${e.founder_score} (${e.founder_status || "n/a"}), investor ${e.investor_score} (${e.investor_status || "n/a"}).`,
    e.company_stage ? `Company stage: ${e.company_stage}` : "",
    recSummary ? `What they likely need (Festival summary): ${recSummary}` : "",
    e.manual_profile_hint ? `Operator notes: ${e.manual_profile_hint}` : "",
    items.length ? `Scoring rationale by dimension:\n${items.map((i) => `- ${i.rubric} (${i.points}): ${i.reason}`).join("\n").slice(0, 6000)}` : "",
  ].filter(Boolean).join("\n");

  const learningsText = [
    event.learnings_public ? `PUBLIC LEARNINGS:\n${stripHtml(event.learnings_public)}` : "",
    event.learnings_members ? `MEMBERS-ONLY LEARNINGS:\n${stripHtml(event.learnings_members)}` : "",
    event.learnings_attendees ? `ATTENDEES-ONLY LEARNINGS:\n${stripHtml(event.learnings_attendees)}` : "",
  ].filter(Boolean).join("\n\n");

  const prompt = `You are an extraordinary executive coach and operator writing PRIVATE, personalized post-event learnings for ${firstName}, based on a real Founder Festival event and ${firstName}'s actual Festival profile.

GOAL: ${firstName} should read this and think "oh my god, I can't believe how good these are." Make it feel hand-written for them — specific, not generic. Be probing AND challenging AND genuinely helpful AND supportive, all at once. Name the hard thing kindly. Connect the event's themes to where THIS person specifically is in their journey (their scores, status, stage, and the scoring rationale). Give a few concrete, do-this-next moves, not platitudes.

RULES:
- Ground every point in BOTH the event learnings and ${firstName}'s profile. No filler, no flattery-for-its-own-sake, no restating the event agenda.
- 4–7 punchy points. Each: a bold takeaway, then 1–2 sentences of why-it-matters-for-${firstName} and a specific next step.
- Warm, direct, peer-to-peer voice. Second person ("you").
- Output CLEAN HTML ONLY (no markdown, no <html>/<body>): use <p>, <strong>, <ul>/<li>, and <h3> for any sub-headers. No inline styles.

=== EVENT LEARNINGS ===
${learningsText || "(none provided)"}

=== ${firstName.toUpperCase()}'S FESTIVAL PROFILE ===
${summary || "(no profile data)"}`;
  return { prompt, firstName };
}

async function chief(prompt) {
  const headers = { "X-API-Key": CHIEF_TOKEN, "X-Project-Id": CHIEF_PROJECT, "content-type": "application/json" };
  const post = await fetch("https://api.storytell.ai/v1/chats", {
    method: "POST", headers,
    body: JSON.stringify({ prompt, intelligence: "research", public_data: true }),
  });
  if (!post.ok) throw new Error(`chief POST ${post.status}`);
  const ids = await post.json();
  if (!ids.chat_id || !ids.message_id) throw new Error("chief: no ids");
  const t0 = Date.now();
  const maxWait = 480_000; // 8 min
  while (Date.now() - t0 < maxWait) {
    await sleep(5000);
    const r = await fetch(`https://api.storytell.ai/v1/chats/${ids.chat_id}/messages/${ids.message_id}`, { headers });
    if (!r.ok) continue;
    const m = await r.json().catch(() => null);
    if (m && m.response) return { text: m.response, ms: Date.now() - t0 };
  }
  throw new Error("chief: timeout");
}

(async () => {
  log(`Host ${new URL(DB_URL).host} | event ${EVENT_ID}`);
  await sql`CREATE TABLE IF NOT EXISTS event_personalized_learnings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    method text NOT NULL DEFAULT 'chief',
    html text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS event_personalized_event_eval_unique ON event_personalized_learnings (event_id, evaluation_id)`;

  const [event] = await sql`SELECT title, learnings_public, learnings_members, learnings_attendees FROM events WHERE id = ${EVENT_ID} LIMIT 1`;
  if (!event) { log("Event not found"); process.exit(1); }
  log(`Event: ${event.title}`);

  const attendees = await sql`
    SELECT DISTINCT ea.evaluation_id AS id, e.full_name AS name
    FROM event_attendees ea JOIN evaluations e ON e.id = ea.evaluation_id
    WHERE ea.event_id = ${EVENT_ID} AND ea.evaluation_id IS NOT NULL`;
  const done = await sql`SELECT evaluation_id FROM event_personalized_learnings WHERE event_id = ${EVENT_ID}`;
  const doneSet = new Set(done.map((d) => d.evaluation_id));
  const todo = attendees.filter((a) => !doneSet.has(a.id));
  log(`Attendees: ${attendees.length} matched, ${doneSet.size} already done, ${todo.length} to generate.`);

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const a = todo[i];
    log(`(${i + 1}/${todo.length}) ${a.name || a.id} …`);
    try {
      const built = await buildPrompt(a.id, event);
      if (!built) { log(`  skip — no profile`); fail++; continue; }
      const res = await chief(built.prompt);
      const html = sanitize(res.text);
      await sql`
        INSERT INTO event_personalized_learnings (event_id, evaluation_id, method, html, generated_at)
        VALUES (${EVENT_ID}, ${a.id}, 'chief', ${html}, now())
        ON CONFLICT (event_id, evaluation_id) DO UPDATE SET method='chief', html=${html}, generated_at=now()`;
      ok++;
      log(`  ✓ stored (${Math.round(res.ms / 1000)}s, ${html.length} chars)`);
    } catch (e) {
      fail++;
      log(`  ✗ ${e.message}`);
    }
  }
  log(`DONE — ${ok} generated, ${fail} failed, ${doneSet.size} pre-existing.`);
})().catch((e) => { log("FATAL " + e.message); process.exit(1); });
