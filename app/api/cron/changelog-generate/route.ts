import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { changelogEntries } from "@/lib/db/schema/changelog";
import { ensureChangelogTables } from "@/lib/changelog";
import { listRecentCommits } from "@/lib/github";
import { generateChangelogEntries } from "@/lib/changelog-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Overlap buffer: fetch 13h of commits on a 12h cadence so a slightly-late run
// never drops a commit; SHAs already covered by an existing entry are removed
// so the overlap can't double-post.
const WINDOW_HOURS = 13;

// Auto-generate changelog entries from recently-merged commits. Runs on a Vercel
// cron every 12h. If there are no NEW commits in the window it returns early and
// does NOT call the LLM (no wasted API call). New entries are left unnotified so
// the existing changelog-notify cron emails subscribers about them.
//
// Protected by CRON_SECRET (Vercel cron sends `Authorization: Bearer $CRON_SECRET`).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured (CRON_SECRET unset)" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "no database" }, { status: 503 });

  await ensureChangelogTables();
  const db = getDb();

  const sinceISO = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const commits = await listRecentCommits(sinceISO);
  if (commits.length === 0) {
    return NextResponse.json({ generated: 0, newCommits: 0 });
  }

  // Build the set of already-covered SHAs from existing entries' commit_shas
  // (plus the representative commit_sha) so overlapping windows never re-post.
  const existing = await db
    .select({ commitSha: changelogEntries.commitSha, commitShas: changelogEntries.commitShas })
    .from(changelogEntries);
  const covered = new Set<string>();
  for (const row of existing) {
    if (row.commitSha) covered.add(row.commitSha.toLowerCase());
    for (const s of row.commitShas ?? []) covered.add(String(s).toLowerCase());
  }

  const newCommits = commits.filter((c) => !covered.has(c.sha.toLowerCase()));
  // No NEW commits → do nothing, and importantly do NOT call the LLM.
  if (newCommits.length === 0) {
    return NextResponse.json({ generated: 0, newCommits: 0 });
  }

  const entries = await generateChangelogEntries(newCommits);
  if (entries.length === 0) {
    // Model unavailable/failed — no-op gracefully (cron will retry next window).
    return NextResponse.json({ generated: 0, newCommits: newCommits.length });
  }

  let inserted = 0;
  for (const e of entries) {
    // Skip if any of this entry's SHAs was already covered (defense in depth vs
    // a concurrent run) or if the slug already exists.
    if (e.commitShas.some((s) => covered.has(s.toLowerCase()))) continue;
    const res = await db
      .insert(changelogEntries)
      .values({
        slug: e.slug,
        shippedAt: new Date(e.shippedAt),
        title: e.title,
        summary: e.summary,
        bullets: e.bullets,
        changeType: e.changeType,
        categories: e.categories,
        authors: e.authors,
        commitSha: e.commitSha,
        commitShas: e.commitShas,
        // Leave notifiedAt NULL so changelog-notify emails subscribers.
      })
      .onConflictDoNothing({ target: changelogEntries.slug })
      .returning({ id: changelogEntries.id });
    if (res.length > 0) {
      inserted += 1;
      for (const s of e.commitShas) covered.add(s.toLowerCase());
    }
  }

  return NextResponse.json({ generated: inserted, newCommits: newCommits.length });
}
