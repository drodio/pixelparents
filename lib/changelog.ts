import { desc } from "drizzle-orm";
import { getDb, getSql, hasDatabase } from "@/lib/db";
import { changelogEntries, changelogSubscribers } from "@/lib/db/schema/changelog";
import { sql } from "drizzle-orm";

export type ChangeType = "feature" | "enhancement" | "bug_fix";

export const CHANGE_TYPES: { value: ChangeType; label: string }[] = [
  { value: "feature", label: "Feature" },
  { value: "enhancement", label: "Enhancement" },
  { value: "bug_fix", label: "Bug Fix" },
];

// Tailwind badge styling per change type (pixelparents black/amber theme).
export const CHANGE_TYPE_STYLE: Record<ChangeType, string> = {
  feature: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/30",
  enhancement: "bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/30",
  bug_fix: "bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/30",
};

export function changeTypeLabel(t: string): string {
  return CHANGE_TYPES.find((c) => c.value === t)?.label ?? t;
}

export const CHANGELOG_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "signup", label: "Signup" },
  { slug: "profiles", label: "Profiles" },
  { slug: "sharing", label: "Sharing" },
  { slug: "photos", label: "Photos" },
  { slug: "admin", label: "Admin" },
  { slug: "developers", label: "Developer API" },
  { slug: "email", label: "Email" },
  { slug: "security", label: "Security" },
  { slug: "performance", label: "Performance" },
  { slug: "infrastructure", label: "Infrastructure" },
  { slug: "design", label: "Design" },
  { slug: "events", label: "Events" },
  { slug: "notifications", label: "Notifications" },
  { slug: "resources", label: "Resources" },
];

export function categoryLabel(slug: string): string {
  return CHANGELOG_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;
}

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

// ---------------------------------------------------------------------------
// Self-healing DDL (self-contained — does NOT depend on lib/db/ensure.ts).
//
// The public /changelog page and its subscribe form share one Neon database
// with the rest of the app. The changelog tables are not part of the consolidated
// migration flow yet, so another feature running `drizzle-kit push` from its own
// partial schema could drop them — and a fresh database wouldn't have them at all.
// Rather than let the public page silently return empty, we idempotently ensure
// both tables (and any newer columns) exist on the first changelog operation per
// cold start. Runs once per process; failures are swallowed so reads degrade to
// "no entries" instead of throwing.
// ---------------------------------------------------------------------------
let ensured: Promise<void> | null = null;

export function ensureChangelogTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const db = getSql();
      // All idempotent DDL in one round-trip. CREATE handles a dropped/missing
      // table; the ALTERs upgrade an older table in place.
      await db.transaction([
        db`
        CREATE TABLE IF NOT EXISTS changelog_entries (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          slug text NOT NULL,
          shipped_at timestamptz NOT NULL,
          title text NOT NULL,
          summary text NOT NULL,
          bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
          change_type text NOT NULL,
          categories jsonb NOT NULL DEFAULT '[]'::jsonb,
          commit_sha text,
          notified_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `,
        db`ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS bullets jsonb NOT NULL DEFAULT '[]'::jsonb`,
        db`ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]'::jsonb`,
        db`ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS commit_sha text`,
        db`ALTER TABLE changelog_entries ADD COLUMN IF NOT EXISTS notified_at timestamptz`,
        db`CREATE UNIQUE INDEX IF NOT EXISTS changelog_entries_slug_unique ON changelog_entries (slug)`,
        db`CREATE UNIQUE INDEX IF NOT EXISTS changelog_entries_commit_sha_unique ON changelog_entries (commit_sha)`,
        db`CREATE INDEX IF NOT EXISTS changelog_entries_shipped_at_idx ON changelog_entries (shipped_at)`,
        db`
        CREATE TABLE IF NOT EXISTS changelog_subscribers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          unsubscribed_at timestamptz,
          unsubscribe_token text NOT NULL DEFAULT gen_random_uuid()
        )
      `,
        // Per-subscriber unsubscribe token (capability link in every email).
        db`ALTER TABLE changelog_subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token text NOT NULL DEFAULT gen_random_uuid()`,
        db`CREATE UNIQUE INDEX IF NOT EXISTS changelog_subscribers_email_unique ON changelog_subscribers (email)`,
      ]);
    })().catch((e) => {
      // Reset so a later cold path can retry; don't crash the request.
      ensured = null;
      console.error("ensureChangelogTables failed:", e);
    });
  }
  return ensured;
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// Newest-first list of all entries for the public page. Seeds the initial set
// of shipped features the first time it runs against an empty table, so the
// public velocity signal is never blank on a fresh database.
export async function getChangelogEntries(): Promise<ChangelogEntryView[]> {
  if (!hasDatabase()) return [];
  try {
    await ensureChangelogTables();
    await ensureSeedEntries();
    const rows = await getDb()
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
      changeType: (r.changeType as ChangeType) ?? "enhancement",
      categories: r.categories ?? [],
    }));
  } catch (err) {
    console.error("getChangelogEntries failed:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

// Subscribe an email (idempotent). Re-subscribing clears a prior unsubscribe.
export async function subscribeEmail(email: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  const clean = email.trim().toLowerCase();
  try {
    await ensureChangelogTables();
    await getDb()
      .insert(changelogSubscribers)
      .values({ email: clean })
      .onConflictDoUpdate({
        target: changelogSubscribers.email,
        set: { unsubscribedAt: sql`null` },
      });
    return true;
  } catch (err) {
    console.error("subscribeEmail failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Seed — ~12 real recently-shipped features, written as crisp, PII-free,
// user-facing changelog entries. Idempotent on slug, so re-running is safe.
//
// NO real names or emails: every entry describes a FEATURE, never a person.
// ---------------------------------------------------------------------------
export type SeedEntry = {
  slug: string;
  shippedAt: string; // ISO date
  title: string;
  summary: string;
  bullets: string[];
  changeType: ChangeType;
  categories: string[];
};

export const SEED_ENTRIES: SeedEntry[] = [
  {
    slug: "community-resource-boards",
    shippedAt: "2026-06-30T18:00:00Z",
    title: "Community resource boards",
    summary:
      "The Resources tab is now a set of community boards: curated, upvoteable collections of links, files, and notes that stay organized and permanent instead of scrolling away in a chat.",
    bullets: [
      "Start a board on any topic and fill it with links, uploaded files, or written notes.",
      "Boards are auto-labeled by topic, upvoteable, and followable, and every contribution is credited to whoever shared it.",
    ],
    changeType: "feature",
    categories: ["resources", "sharing"],
  },
  {
    slug: "resource-board-files-pinning-editing",
    shippedAt: "2026-06-30T20:00:00Z",
    title: "Files, pinning, and editing on boards",
    summary:
      "Resource boards now take document uploads, let board owners pin the most useful contributions, and let contributors edit or remove their own posts.",
    bullets: [
      "Upload PDFs and documents to a board, not just links.",
      "Board owners can pin key contributions to the top; anyone can edit or delete their own.",
      "The whole board card is now clickable, so it is easier to open on any device.",
    ],
    changeType: "enhancement",
    categories: ["resources", "design"],
  },
  {
    slug: "sign-in-with-pixel-parents",
    shippedAt: "2026-06-29T17:00:00Z",
    title: "Sign in with Pixel Parents",
    summary:
      "A drop-in “Sign in with Pixel Parents” button lets other OHS community tools authenticate parents without rebuilding accounts.",
    bullets: [
      "Published the @pixelparents/auth SDK with a one-line button component.",
      "OAuth-style flow returns a verified parent identity to partner apps.",
      "Docs and a copy-paste integration snippet for builders.",
    ],
    changeType: "feature",
    categories: ["developers", "signup"],
  },
  {
    slug: "ai-family-matcher",
    shippedAt: "2026-06-28T16:00:00Z",
    title: "AI matcher for family connections",
    summary:
      "The directory now suggests families to connect with based on shared interests, grade levels, and location.",
    bullets: [
      "Ranks suggestions from profile signals — no manual searching required.",
      "Explains why each family was suggested.",
    ],
    changeType: "feature",
    categories: ["profiles", "sharing"],
  },
  {
    slug: "in-app-notifications",
    shippedAt: "2026-06-27T18:30:00Z",
    title: "In-app notifications",
    summary:
      "A new notification center surfaces connection requests, accepted intros, and updates without leaving the app.",
    bullets: [
      "Unread badge in the top bar.",
      "Mark-all-as-read and per-item dismissal.",
    ],
    changeType: "feature",
    categories: ["notifications"],
  },
  {
    slug: "growth-invites",
    shippedAt: "2026-06-26T15:00:00Z",
    title: "Invite other families",
    summary:
      "Members can now invite other OHS families with a personal referral link and track who has joined.",
    bullets: [
      "Unique invite links per member.",
      "A simple view of pending and accepted invites.",
    ],
    changeType: "feature",
    categories: ["signup", "sharing"],
  },
  {
    slug: "contact-sharing-on-accept",
    shippedAt: "2026-06-25T14:00:00Z",
    title: "Contact details shared on accept",
    summary:
      "When two families accept a connection, their chosen contact details are exchanged automatically — no copy-pasting.",
    bullets: [
      "Each family controls which details are shared.",
      "Nothing is revealed until both sides opt in.",
    ],
    changeType: "feature",
    categories: ["sharing", "profiles"],
  },
  {
    slug: "events-tab-ohs-calendar",
    shippedAt: "2026-06-24T13:00:00Z",
    title: "Events tab with OHS calendar import",
    summary:
      "A new Events tab brings the OHS calendar into the app so families can see what’s coming up in one place.",
    bullets: [
      "Imports the official OHS calendar.",
      "Month grid plus an upcoming-events list.",
    ],
    changeType: "feature",
    categories: ["events"],
  },
  {
    slug: "privacy-terms-report-to-admin",
    shippedAt: "2026-06-23T12:00:00Z",
    title: "Privacy Policy, Terms, and report-to-admin",
    summary:
      "Published a clear Privacy Policy and Terms of Service, and added a one-tap way to report a concern to admins.",
    bullets: [
      "Report dialog available from the footer.",
      "Plain-language policies written for parents.",
    ],
    changeType: "feature",
    categories: ["admin", "security"],
  },
  {
    slug: "mobile-responsive-app-shell",
    shippedAt: "2026-06-22T11:00:00Z",
    title: "Mobile-responsive redesign",
    summary:
      "The whole app now adapts to phones with a native-feeling shell, including filter sheets and a scrollable month grid.",
    bullets: [
      "Bottom-sheet filters on the directory and events.",
      "Touch-friendly targets throughout.",
    ],
    changeType: "enhancement",
    categories: ["design"],
  },
  {
    slug: "framer-motion-visual-overhaul",
    shippedAt: "2026-06-21T10:00:00Z",
    title: "Visual overhaul with motion",
    summary:
      "Refreshed the interface with smooth Framer Motion transitions and a more polished black-and-amber look.",
    bullets: [
      "Subtle animations on cards, dialogs, and navigation.",
      "Respects reduced-motion preferences.",
    ],
    changeType: "enhancement",
    categories: ["design"],
  },
  {
    slug: "geist-font-design-system",
    shippedAt: "2026-06-20T09:00:00Z",
    title: "Geist font and design system",
    summary:
      "Adopted the Geist typeface and a shared design system for consistent spacing, color, and components.",
    bullets: [
      "One source of truth for buttons, badges, and inputs.",
      "Crisper typography across every page.",
    ],
    changeType: "enhancement",
    categories: ["design"],
  },
  {
    slug: "directory-performance",
    shippedAt: "2026-06-19T08:00:00Z",
    title: "Faster directory",
    summary:
      "The family directory loads and filters noticeably faster, even with the full community loaded.",
    bullets: [
      "Reduced data sent to the browser.",
      "Snappier filtering and search.",
    ],
    changeType: "enhancement",
    categories: ["performance", "profiles"],
  },
  {
    slug: "blob-auth-security-fix",
    shippedAt: "2026-06-18T07:00:00Z",
    title: "Hardened file uploads",
    summary:
      "Fixed an authorization gap so uploaded files (like profile photos) can only be accessed by the people they’re meant for.",
    bullets: [
      "Upload URLs are now properly scoped and verified.",
      "No action needed — existing files are protected.",
    ],
    changeType: "bug_fix",
    categories: ["security", "photos"],
  },
];

// Insert the seed entries, skipping any whose slug already exists. Returns the
// number of new rows inserted. Idempotent — safe to run on every deploy.
export async function seedChangelog(): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureChangelogTables();
  const db = getDb();
  let inserted = 0;
  for (const e of SEED_ENTRIES) {
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
        commitSha: `seed:${e.slug}`,
        // Mark seed entries as already-notified so they don't email everyone
        // the first time the cron runs.
        notifiedAt: new Date(),
      })
      .onConflictDoNothing({ target: changelogEntries.slug })
      .returning({ id: changelogEntries.id });
    inserted += res.length;
  }
  return inserted;
}

// Ensure every seed entry is present, inserting only the ones whose slug is
// missing (seedChangelog is idempotent via onConflictDoNothing on slug). Unlike
// the old "seed only when the table is empty" approach, this also backfills NEW
// seed entries into a table that was populated by an earlier, shorter seed list
// — otherwise the public changelog silently freezes at whatever shipped the day
// it was first seeded. Runs at most once per cold start.
let seedChecked = false;
export async function ensureSeedEntries(): Promise<void> {
  if (seedChecked) return;
  seedChecked = true;
  try {
    await seedChangelog();
  } catch (err) {
    seedChecked = false; // allow a retry on a later request
    console.error("ensureSeedEntries failed:", err);
  }
}
