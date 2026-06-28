// Generate "Attendee Insights" (Recommended Connections) via Chief for ONE
// attendee of an event, and store it so it shows in the admin attendee row.
// Self-contained: Chief creds from .env.local, prod DB from .env.prod.local.
//
//   node scripts/generate-connections-for-attendee.cjs <eventId> "<name substring>" [--async]
//
// Flags may appear in any position. --async submits to Chief and stores a
// 'generating' row for the deployed cron to poll (exercises the async pipeline)
// instead of waiting inline.
//
// This is a HUMAN-RUN verification tool that writes to the PRODUCTION DB. Per
// AGENTS.md, agents/sessions must never write to prod out-of-band, so it refuses
// to run unless FF_ALLOW_PROD_WRITE=1 is set to confirm intentional human use.
//
// Mirrors src/lib/recommended-connections.ts (buildConnectionsPrompt) and the
// generate-personalized-for-event.cjs Chief/polling pattern.
const fs = require("fs");
require("dotenv").config({ path: ".env.local" }); // CHIEF_API_TOKEN / CHIEF_PROJECT_ID
const { neon } = require("@neondatabase/serverless");

const ARGS = process.argv.slice(2);
const ASYNC = ARGS.includes("--async");
const POSITIONAL = ARGS.filter((a) => !a.startsWith("--"));
const EVENT_ID = POSITIONAL[0];
const NAME = (POSITIONAL[1] || "").toLowerCase();
if (!EVENT_ID || !NAME) {
  console.error('Usage: node scripts/generate-connections-for-attendee.cjs <eventId> "<name substring>" [--async]');
  process.exit(1);
}

// AGENTS.md guard: this tool mutates the production DB. Require an explicit,
// human opt-in so an automated/agent invocation can't silently write to prod.
if (!process.env.FF_ALLOW_PROD_WRITE) {
  console.error("Refusing to run: this tool writes to the PRODUCTION database.");
  console.error("If you are a human running this intentionally, set FF_ALLOW_PROD_WRITE=1.");
  process.exit(1);
}

const prodPath = "/Users/drodio/Projects/founder-festival/.env.prod.local";
const prodEnv = require("dotenv").parse(fs.readFileSync(prodPath));
const DB_URL =
  prodEnv.POSTGRES_URL_NON_POOLING || prodEnv.DATABASE_URL_UNPOOLED || prodEnv.POSTGRES_URL || prodEnv.DATABASE_URL;
if (!DB_URL) { console.error("No prod Postgres URL in", prodPath); process.exit(1); }
const BASE = (prodEnv.NEXT_PUBLIC_SITE_URL || "https://festival.so").replace(/\/+$/, "");

const CHIEF_TOKEN = process.env.CHIEF_API_TOKEN;
const CHIEF_PROJECT = process.env.CHIEF_PROJECT_ID;
if (!CHIEF_TOKEN || !CHIEF_PROJECT) { console.error("CHIEF_API_TOKEN / CHIEF_PROJECT_ID missing in .env.local"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = neon(DB_URL);

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function sanitize(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "")
    .replace(/ on[a-z]+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}
// Mirror of profileUrlFor() in src/lib/profile-slug.ts.
function profileHref(row) {
  if (row.clerk_username && row.clerk_username.trim()) return `/profile/${encodeURIComponent(row.clerk_username.trim())}`;
  if (row.slug && row.slug_kind) return `/profile/${row.slug_kind}/${row.slug}`;
  return `/profile?e=${row.id}`;
}

const CHIEF_HEADERS = { "X-API-Key": CHIEF_TOKEN, "X-Project-Id": CHIEF_PROJECT, "content-type": "application/json" };

// Fast POST → { chat_id, message_id }. Single source of the Chief submit
// contract, shared by the sync (chief()) and --async paths.
async function chiefSubmit(prompt) {
  const post = await fetch("https://api.storytell.ai/v1/chats", {
    method: "POST", headers: CHIEF_HEADERS,
    body: JSON.stringify({ prompt, intelligence: "research", public_data: true }),
  });
  if (!post.ok) throw new Error(`chief POST ${post.status}`);
  const ids = await post.json();
  if (!ids.chat_id || !ids.message_id) throw new Error("chief: no ids");
  return ids;
}

async function chief(prompt) {
  const ids = await chiefSubmit(prompt);
  const t0 = Date.now();
  const maxWait = 480_000; // 8 min
  while (Date.now() - t0 < maxWait) {
    await sleep(5000);
    const r = await fetch(`https://api.storytell.ai/v1/chats/${ids.chat_id}/messages/${ids.message_id}`, { headers: CHIEF_HEADERS });
    if (!r.ok) continue;
    const m = await r.json().catch(() => null);
    if (m && m.response) return { text: m.response, ms: Date.now() - t0 };
  }
  throw new Error("chief: timeout");
}

(async () => {
  console.log(`[connections] host ${new URL(DB_URL).host} | event ${EVENT_ID} | match "${NAME}"`);
  const [event] = await sql`SELECT title, slug, learnings_public, learnings_members, learnings_attendees FROM events WHERE id = ${EVENT_ID} LIMIT 1`;
  if (!event) { console.error("Event not found"); process.exit(1); }

  const attendees = await sql`
    SELECT DISTINCT ea.evaluation_id AS id, e.full_name AS name, e.slug, e.slug_kind,
      (SELECT u.clerk_username FROM users u WHERE u.evaluation_id = e.id AND u.clerk_username IS NOT NULL LIMIT 1) AS clerk_username
    FROM event_attendees ea JOIN evaluations e ON e.id = ea.evaluation_id
    WHERE ea.event_id = ${EVENT_ID} AND ea.evaluation_id IS NOT NULL AND ea.removed_by_admin = false`;

  const subject = attendees.find((a) => String(a.name || "").toLowerCase().includes(NAME));
  if (!subject) { console.error(`No matched attendee name contains "${NAME}". Names:`, attendees.map((a) => a.name)); process.exit(1); }
  console.log(`Subject: ${subject.name} (${subject.id})`);

  const learningsText = [
    event.learnings_public ? `PUBLIC LEARNINGS:\n${stripHtml(event.learnings_public)}` : "",
    event.learnings_members ? `MEMBERS-ONLY LEARNINGS:\n${stripHtml(event.learnings_members)}` : "",
    event.learnings_attendees ? `ATTENDEES-ONLY LEARNINGS:\n${stripHtml(event.learnings_attendees)}` : "",
  ].filter(Boolean).join("\n\n");

  const roster = attendees
    .filter((a) => a.id !== subject.id && (a.name || "").trim())
    .map((a) => `- ${a.name.trim()}: ${BASE}${profileHref(a)}`)
    .join("\n");

  const fullName = subject.name.trim();
  const prompt = `I want you to help ${fullName} get more value from ${BASE}/events/${event.slug}. Here is the Founder Festival profile for ${fullName}: ${BASE}${profileHref(subject)}.

Here are all the learnings from the event: ${learningsText || "(none provided)"}.

These are the profiles of the other people who attended the event:
${roster || "(no other attendee profiles available)"}

Based on the profile and everything you know about ${fullName}, and all the learnings from the event, and all the attendees of the event, do the following:

1) Recommend the top 3 people that ${fullName} should connect with after the event. For each person, provide a paragraph summary of why they should make that connection. What will they each learn from each other? What will be valuable to each of them?

2) Recommend 1 thing to "give" to and one thing to "get" from any people at the event where there's a strong match from a give or get perspective.

FORMAT: Output CLEAN HTML ONLY (no markdown, no <html>/<body> wrapper). Use <h3> for the two section headers ("Top 3 connections" and "Give & get"), <p> for prose, <strong> for each recommended person's name, and <ul>/<li> where a list reads better. No inline styles. When you name a person who has a Festival profile URL above, link their name with an <a href="…"> to that URL.`;

  // --async: submit to Chief and store a "generating" row (with the chat ids),
  // then exit — leaving the deployed chief-insights-sweep cron to poll + store.
  // This exercises the real async pipeline end-to-end against prod.
  if (ASYNC) {
    const ids = await chiefSubmit(prompt);
    await sql`
      INSERT INTO event_recommended_connections (event_id, evaluation_id, method, html, status, chief_chat_id, chief_message_id, error, generated_at)
      VALUES (${EVENT_ID}, ${subject.id}, 'chief', '', 'generating', ${ids.chat_id}, ${ids.message_id}, NULL, now())
      ON CONFLICT (event_id, evaluation_id) DO UPDATE SET method='chief', status='generating', chief_chat_id=${ids.chat_id}, chief_message_id=${ids.message_id}, error=NULL, generated_at=now()`;
    console.log(`✓ submitted + stored 'generating' (chat ${ids.chat_id}). The cron will poll + store the answer.`);
    return;
  }

  console.log(`Roster: ${attendees.length - 1} other attendees. Calling Chief (research — can take minutes)…`);
  const res = await chief(prompt);
  const html = sanitize(res.text);
  await sql`
    INSERT INTO event_recommended_connections (event_id, evaluation_id, method, html, generated_at)
    VALUES (${EVENT_ID}, ${subject.id}, 'chief', ${html}, now())
    ON CONFLICT (event_id, evaluation_id) DO UPDATE SET method='chief', html=${html}, generated_at=now()`;
  console.log(`✓ stored (${Math.round(res.ms / 1000)}s, ${html.length} chars)\n`);
  console.log("================ OUTPUT (HTML) ================\n");
  console.log(html);
  console.log("\n================ OUTPUT (text) ================\n");
  console.log(stripHtml(html));
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
