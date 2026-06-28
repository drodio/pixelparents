import { db } from "@/db";
import { changelogEntries, changelogSubscribers } from "@/db/schema";
import { asc, desc, eq, isNull, and } from "drizzle-orm";
import type { ChangeType } from "./changelog-constants";
import { sendChangelogEntryEmail } from "./changelog-email";

// Plain serializable shape passed from server → client components.
export type ChangelogEntryView = {
  id: string;
  slug: string;
  shippedAt: string; // ISO
  title: string;
  summary: string;
  bullets: string[];
  changeType: ChangeType;
  categories: string[];
};

// Headline stats for the /changelog page. "Total PRs" ≈ total entries (the repo
// squash-merges, so each PR lands as one non-merge commit → one changelog entry).
// The per-type counts are scoped to the trailing 30 days. Lives here (not in the
// page render) so the Date.now() call isn't flagged as an impure-render.
export type ChangelogStats = {
  totalPrs: number;
  features: number;
  enhancements: number;
  bugs: number;
};

export function computeChangelogStats(entries: ChangelogEntryView[]): ChangelogStats {
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const inMonth = (iso: string) => new Date(iso).getTime() >= monthAgo;
  const countType = (t: ChangeType) =>
    entries.filter((e) => e.changeType === t && inMonth(e.shippedAt)).length;
  return {
    totalPrs: entries.length,
    features: countType("feature"),
    enhancements: countType("enhancement"),
    bugs: countType("bug_fix"),
  };
}

export async function getChangelogEntries(): Promise<ChangelogEntryView[]> {
  const rows = await db
    .select()
    .from(changelogEntries)
    .orderBy(desc(changelogEntries.shippedAt));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    shippedAt: r.shippedAt.toISOString(),
    title: r.title,
    summary: r.summary,
    bullets: r.bullets ?? [],
    changeType: r.changeType as ChangeType,
    categories: r.categories ?? [],
  }));
}

// Upsert a subscriber. A Clerk account is all that's required — no profile claim.
export async function subscribeToChangelog(clerkUserId: string, email: string): Promise<void> {
  await db
    .insert(changelogSubscribers)
    .values({ clerkUserId, email })
    .onConflictDoUpdate({
      target: changelogSubscribers.clerkUserId,
      set: { email, unsubscribedAt: null },
    });
}

export async function unsubscribeFromChangelog(clerkUserId: string): Promise<void> {
  await db
    .update(changelogSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(eq(changelogSubscribers.clerkUserId, clerkUserId));
}

export async function isChangelogSubscriber(clerkUserId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: changelogSubscribers.id })
    .from(changelogSubscribers)
    .where(
      and(
        eq(changelogSubscribers.clerkUserId, clerkUserId),
        isNull(changelogSubscribers.unsubscribedAt),
      ),
    )
    .limit(1);
  return !!row;
}

// Active subscriber emails — used by the new-entry notifier.
export async function activeSubscriberEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: changelogSubscribers.email })
    .from(changelogSubscribers)
    .where(isNull(changelogSubscribers.unsubscribedAt));
  return rows.map((r) => r.email);
}

// Email every active subscriber about each entry that hasn't been notified yet,
// then mark it notified (so this is safe to call repeatedly — e.g. from a cron
// or post-deploy step). The historical backfill is pre-marked, so it never fires
// for old entries. Intended to run in PRODUCTION only.
export async function notifyNewChangelogEntries(): Promise<{ entries: number; emails: number }> {
  const rows = await db
    .select()
    .from(changelogEntries)
    .where(isNull(changelogEntries.notifiedAt))
    .orderBy(asc(changelogEntries.shippedAt));
  if (rows.length === 0) return { entries: 0, emails: 0 };
  const recipients = await activeSubscriberEmails();
  let emails = 0;
  for (const r of rows) {
    const view: ChangelogEntryView = {
      id: r.id,
      slug: r.slug,
      shippedAt: r.shippedAt.toISOString(),
      title: r.title,
      summary: r.summary,
      bullets: r.bullets ?? [],
      changeType: r.changeType as ChangeType,
      categories: r.categories ?? [],
    };
    for (const to of recipients) {
      try {
        await sendChangelogEntryEmail(view, to);
        emails++;
      } catch {
        // a single bad recipient must not block the rest
      }
    }
    await db.update(changelogEntries).set({ notifiedAt: new Date() }).where(eq(changelogEntries.id, r.id));
  }
  return { entries: rows.length, emails };
}
