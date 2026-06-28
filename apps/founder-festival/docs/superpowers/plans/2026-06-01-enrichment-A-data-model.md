# Enrichment Plan A — Data Model & Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land the schema (multi-email table, subject-location columns, job-item input columns) and the pure DB primitives that Plans B and C build on.

**Architecture:** New `profile_emails` table for the unified multi-email model; new `subject_*` columns on `evaluations`; new `input_*` columns on `scoring_job_items`. Pure helpers for email normalize/order and location parse/precedence-write, fully unit-tested with a dummy `DATABASE_URL`.

**Tech Stack:** Drizzle ORM (Neon), Zod, Vitest. Migrations via `npm run db:generate` (NOT applied to any DB by this plan).

Spec: `docs/superpowers/specs/2026-06-01-bulk-scoring-enrichment-design.md`.

---

### Task A1: Schema — `profile_emails` table

**Files:** Modify `src/db/schema.ts` (add table after `scoringJobItems`); Test `tests/lib/schema-profile-emails.test.ts` (smoke).

- [ ] Add the table:

```ts
export const profileEmails = pgTable(
  "profile_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    email: text("email").notNull(), // stored lowercased + trimmed
    // "verified" (operator-provided / claimer) | "unverified" (anymailfinder/linkedin)
    status: text("status").notNull(),
    // "operator" | "anymailfinder" | "linkedin"
    source: text("source").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    addedBy: text("added_by"), // Clerk id for operator source; null otherwise
  },
  (t) => ({
    evalEmailUnique: uniqueIndex("profile_emails_eval_email_unique").on(
      t.evaluationId,
      sql`lower(${t.email})`,
    ),
    evalIdx: index("profile_emails_evaluation_id_idx").on(t.evaluationId),
  }),
);
```

- [ ] `npm run db:generate` → new migration (do NOT apply). Review the SQL.
- [ ] Commit (`feat(db): profile_emails table for multi-email model`).

### Task A2: Schema — subject-location columns on `evaluations`

**Files:** Modify `src/db/schema.ts` (evaluations columns, near `requestCountry`).

- [ ] Add:

```ts
    // Canonical subject location (the person being scored), distinct from
    // requestCity/* (scorer IP) and users.city/* (claimer self-set). Populated
    // by CSV/operator, parsed LinkedIn (NFX display_name), or mirrored from a
    // claimer. Precedence: claimer > operator > linkedin (see subject-location.ts).
    subjectCity: text("subject_city"),
    subjectRegion: text("subject_region"),
    subjectCountry: text("subject_country"),
    subjectLocationRaw: text("subject_location_raw"), // original free text we couldn't structure
    subjectLocationSource: text("subject_location_source"), // "claimer" | "operator" | "linkedin"
```

- [ ] `npm run db:generate`; review; commit.

### Task A3: Schema — `input_*` columns on `scoring_job_items`

**Files:** Modify `src/db/schema.ts` (scoringJobItems columns).

- [ ] Add after `inputCompany`:

```ts
    // Enrichment fields carried from the input row through the async pipeline.
    inputEmail: text("input_email"),
    inputCity: text("input_city"),
    inputRegion: text("input_region"),
    inputCountry: text("input_country"),
    inputLocationRaw: text("input_location_raw"),
```

- [ ] Also add a new terminal status value `enriched` (status is free text; document it in the column comment alongside the existing `pending|resolving|resolved|scoring|done|failed|skipped`).
- [ ] `npm run db:generate`; review; commit.

### Task A4: `src/lib/subject-location.ts` — parse + precedence

**Files:** Create `src/lib/subject-location.ts`; Test `tests/lib/subject-location.test.ts`.

- [ ] **Pure** parse + rank (no DB — testable without DATABASE_URL):

```ts
export type LocationSource = "claimer" | "operator" | "linkedin";
export const LOCATION_RANK: Record<LocationSource, number> = { linkedin: 1, operator: 2, claimer: 3 };

export type SubjectLocation = {
  city: string | null; region: string | null; country: string | null; raw: string | null;
};

// Best-effort structure a free-text location ("San Francisco, California, United States"
// → {city:"San Francisco", region:"California", country:"United States"}). Comma-split
// from most-specific to least; 1 part → country-or-city heuristic kept in raw. ALWAYS
// returns raw = the original trimmed string.
export function parseLocationDisplayName(input: string | null | undefined): SubjectLocation {
  const raw = (input ?? "").trim();
  if (!raw) return { city: null, region: null, country: null, raw: null };
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return { city: parts[0], region: parts[1], country: parts[parts.length - 1], raw };
  if (parts.length === 2) return { city: parts[0], region: null, country: parts[1], raw };
  return { city: null, region: null, country: null, raw }; // 1 part: keep raw only (e.g. "Bay Area")
}

// Should a write from `incoming` source overwrite the current stored source?
export function shouldOverwriteLocation(current: LocationSource | null, incoming: LocationSource): boolean {
  if (current == null) return true;
  return LOCATION_RANK[incoming] >= LOCATION_RANK[current];
}
```

- [ ] **DB write** (separate, integration-ish — reads current source, applies precedence):

```ts
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function writeSubjectLocation(
  evaluationId: string, loc: SubjectLocation, source: LocationSource,
): Promise<void> {
  const [row] = await db.select({ src: evaluations.subjectLocationSource })
    .from(evaluations).where(eq(evaluations.id, evaluationId)).limit(1);
  const current = (row?.src ?? null) as LocationSource | null;
  if (!shouldOverwriteLocation(current, source)) return;
  if (!loc.city && !loc.region && !loc.country && !loc.raw) return;
  await db.update(evaluations).set({
    subjectCity: loc.city, subjectRegion: loc.region, subjectCountry: loc.country,
    subjectLocationRaw: loc.raw, subjectLocationSource: source,
  }).where(eq(evaluations.id, evaluationId));
}
```

- [ ] Tests (pure parts only, dummy DATABASE_URL for import): `parseLocationDisplayName` for 3/2/1-part inputs + empty; `shouldOverwriteLocation` matrix (null→any true; claimer not overwritten by operator/linkedin; operator overwrites linkedin; equal source overwrites).
- [ ] Commit.

### Task A5: `src/lib/profile-emails.ts` — normalize, order, upsert, read

**Files:** Create `src/lib/profile-emails.ts`; Test `tests/lib/profile-emails.test.ts`.

- [ ] Pure helpers:

```ts
export type EmailStatusValue = "verified" | "unverified";
export type EmailSource = "operator" | "anymailfinder" | "linkedin";
export type ProfileEmail = { email: string; status: EmailStatusValue; source: EmailSource; addedAt?: Date };

export function normalizeEmail(s: string): string { return s.trim().toLowerCase(); }
export function isEmail(s: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()); }

// Display/CSV order: verified first, then unverified; tie-break most-recent added.
export function orderEmailsForDisplay(emails: ProfileEmail[]): ProfileEmail[] {
  const rank = (s: EmailStatusValue) => (s === "verified" ? 0 : 1);
  return [...emails].sort((a, b) =>
    rank(a.status) - rank(b.status) || (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0));
}
```

- [ ] DB upsert (status precedence: verified upgrades unverified; never downgrade):

```ts
import { db } from "@/db";
import { profileEmails } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function upsertProfileEmail(
  evaluationId: string, email: string, status: EmailStatusValue, source: EmailSource, addedBy?: string | null,
): Promise<void> {
  const norm = normalizeEmail(email);
  if (!isEmail(norm)) return;
  await db.insert(profileEmails)
    .values({ evaluationId, email: norm, status, source, addedBy: addedBy ?? null })
    .onConflictDoUpdate({
      target: [profileEmails.evaluationId, sql`lower(${profileEmails.email})`],
      // Only upgrade to verified; keep existing source/addedBy if already verified.
      set: { status: sql`CASE WHEN ${profileEmails.status} = 'verified' THEN 'verified' ELSE excluded.status END`,
             source: sql`CASE WHEN ${profileEmails.status} = 'verified' THEN ${profileEmails.source} ELSE excluded.source END` },
    });
}

export async function listProfileEmails(evaluationId: string): Promise<ProfileEmail[]> {
  const rows = await db.select().from(profileEmails).where(eq(profileEmails.evaluationId, evaluationId));
  return rows.map((r) => ({ email: r.email, status: r.status as EmailStatusValue, source: r.source as EmailSource, addedAt: r.addedAt }));
}
```

- [ ] Tests (pure): `normalizeEmail`, `isEmail` (valid/invalid), `orderEmailsForDisplay` (verified-first, recency tiebreak).
- [ ] Verify the `onConflictDoUpdate` target compiles against the partial/expression unique index (drizzle may need `target: sql\`(evaluation_id, lower(email))\``; adjust at implementation, fall back to a manual select-then-insert/update if the expression index can't be targeted).
- [ ] Commit.

### Task A6: Backfill migration — `found_email` → `profile_emails`

**Files:** Create a hand-written migration `drizzle/00NN_backfill_profile_emails.sql` (after the generated ones).

- [ ] SQL (idempotent via the unique index):

```sql
INSERT INTO profile_emails (evaluation_id, email, status, source, added_at, added_by)
SELECT id, lower(found_email), 'unverified', 'anymailfinder', COALESCE(found_email_at, now()), found_email_by
FROM evaluations
WHERE found_email IS NOT NULL
ON CONFLICT (evaluation_id, lower(email)) DO NOTHING;
```

- [ ] Add it to `drizzle/meta/_journal.json` manually (drizzle won't generate data migrations) OR document that it's an operator-run script. Prefer a script `scripts/backfill-profile-emails.ts` invoked like the existing `bootstrap-mm` script (`tsx --require dotenv/config`), so it's explicit and not auto-run by migrate.
- [ ] Commit (do NOT run it).

---

## Self-Review
- Covers spec §Part-1 schema (profile_emails) ✓, §Part-2 subject columns ✓, §Part-3 job-item columns ✓, precedence helpers ✓, migration/backfill ✓ (script, not auto-run).
- No DB is mutated by this plan (migrations generated + backfill scripted, not applied).
- Pure helpers are unit-tested; DB helpers compile + are exercised by Plan B.
