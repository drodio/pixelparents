// Part 2 data move for a single event (default slug 9nj5he2k): move everything
// currently in ATTENDEES-ONLY learnings into MEMBERS-ONLY, leaving only the
// "Founder Festival algorithm" part at the bottom in ATTENDEES-ONLY.
//
// Split point = the first heading-ish element whose text matches /algorithm/i.
// Everything before it -> members (appended to any existing members); that point
// onward -> attendees.
//
//   Dry run (no writes, shows the split):
//     node scripts/move-event-learnings.cjs /Users/drodio/Projects/founder-festival/.env.prod.local 9nj5he2k
//   Apply:
//     node scripts/move-event-learnings.cjs /Users/drodio/Projects/founder-festival/.env.prod.local 9nj5he2k --apply
require("dotenv").config({ path: process.argv[2] || ".env.local" });
const { neon } = require("@neondatabase/serverless");
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
const slug = process.argv[3] || "9nj5he2k";
const apply = process.argv.includes("--apply");

function findSplit(html) {
  // Prefer a heading (h1-h6) containing "algorithm"; else any tag boundary right
  // before the word "algorithm".
  const h = html.match(/<h[1-6][^>]*>[^<]*algorithm/i);
  if (h && h.index != null) return h.index;
  const w = html.search(/algorithm/i);
  if (w === -1) return -1;
  // back up to the nearest preceding "<" so we don't cut mid-element.
  const lt = html.lastIndexOf("<", w);
  return lt === -1 ? w : lt;
}

(async () => {
  const sql = neon(url);
  console.log("host:", new URL(url).host, "| slug:", slug, "| mode:", apply ? "APPLY" : "DRY RUN");
  const [ev] = await sql`SELECT id, title, learnings_members, learnings_attendees FROM events WHERE slug = ${slug} LIMIT 1`;
  if (!ev) { console.error("No event with slug", slug); process.exit(1); }
  const att = ev.learnings_attendees || "";
  if (!att.trim()) { console.error("Attendees learnings empty — nothing to move."); process.exit(1); }

  const algoStart = findSplit(att);
  if (algoStart === -1) { console.error("Could not find an 'algorithm' section in attendees learnings. Aborting so nothing is lost."); process.exit(1); }

  // Isolate ONLY the algorithm section: from its heading until the NEXT major
  // heading (h1/h2). Everything else — before AND after — moves to members, so a
  // topic that happens to sit below the algorithm block (e.g. "Recurring Theme…")
  // isn't wrongly left in attendees.
  const rest = att.slice(algoStart);
  const nextHeadingRel = rest.slice(1).search(/<h[12][\s>]/i); // skip the algo heading itself
  const algoEnd = nextHeadingRel === -1 ? att.length : algoStart + 1 + nextHeadingRel;

  const before = att.slice(0, algoStart).trim();
  const after = att.slice(algoEnd).trim();
  const algo = att.slice(algoStart, algoEnd).trim();
  const existingMembers = (ev.learnings_members || "").trim();
  const newMembers = [existingMembers, before, after].filter(Boolean).join("\n");
  const newAttendees = algo;

  console.log("\n--- WILL MOVE TO MEMBERS (length " + newMembers.length + ") ---\n" + newMembers.slice(0, 1200) + (newMembers.length > 1200 ? "\n…[truncated]" : ""));
  console.log("\n--- WILL STAY IN ATTENDEES (length " + newAttendees.length + ") ---\n" + newAttendees.slice(0, 1200) + (newAttendees.length > 1200 ? "\n…[truncated]" : ""));

  if (!apply) { console.log("\nDRY RUN — re-run with --apply to write."); return; }
  await sql`UPDATE events SET learnings_members = ${newMembers}, learnings_attendees = ${newAttendees}, updated_at = now() WHERE id = ${ev.id}`;
  console.log("\nApplied ✓");
})().catch((e) => { console.error(e.message); process.exit(1); });
