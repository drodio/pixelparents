# Enrichment Plan B — Ingestion & Enrich-Existing

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Extract email + location from pasted rows / CSV, carry them through the job pipeline, and enrich existing-profile matches instead of skipping them.

**Architecture:** Extend the parsers to emit optional `email`/location per row; carry CSV structure as JSON (the flat `csvToJobLines` string is lossy). `POST /api/admin/jobs` enriches matches synchronously (no LLM) and queues new profiles; the scoring-tick cron applies the same enrichment to new profiles after scoring. A shared `applyRowEnrichment` writes emails + location via Plan A's primitives.

**Depends on:** Plan A. Spec: `docs/superpowers/specs/2026-06-01-bulk-scoring-enrichment-design.md`.

---

### Task B1: Extend `ParsedLine` + inline email in `parse-paste-input.ts`

**Files:** Modify `src/lib/parse-paste-input.ts`; Test `tests/lib/parse-paste-input.test.ts`.

- [ ] Add optional enrichment fields to the `url` and `nameCompany` variants:

```ts
type Enrich = { email?: string | null; city?: string | null; region?: string | null; country?: string | null; locationRaw?: string | null };
export type ParsedLine =
  | ({ kind: "url"; raw: string; linkedinUrl: string } & Enrich)
  | ({ kind: "nameCompany"; raw: string; name: string; company: string | null } & Enrich)
  | { kind: "invalid"; raw: string; reason: string };
```

- [ ] In the non-YC branch, before the `name,company` split: detect + strip an inline email with `isEmail`-style regex (`/[^\s,;]+@[^\s,;]+\.[^\s,;]+/`). If a token in the comma-split is an email, pull it out as `email` and exclude it from name/company. So `"Jane Doe, Acme, jane@acme.com"` → `{name:"Jane Doe", company:"Acme", email:"jane@acme.com"}`; `"Jane Doe, jane@acme.com"` → `{name:"Jane Doe", company:null, email:"jane@acme.com"}`.
- [ ] URL lines: detect a trailing email on the same line too (rare) → attach.
- [ ] Tests: email pulled out of a 3-part line; email-only-as-2nd-field doesn't become company; line with no email unchanged; YC paste unaffected.
- [ ] Commit.

### Task B2: `parseCsvRows` — structured CSV with email + location

**Files:** Modify `src/lib/csv-to-lines.ts`; Test `tests/lib/csv-to-lines.test.ts`.

- [ ] Add header tokens:

```ts
const EMAIL = new Set(["email", "e-mail", "work email", "email address"]);
const CITY = new Set(["city", "town"]);
const REGION = new Set(["state", "region", "province", "st"]);
const COUNTRY = new Set(["country", "nation"]);
const LOCATION = new Set(["location", "based in"]);
```
Add these to `HEADER_TOKENS`.

- [ ] New exported function returning STRUCTURED rows (don't collapse to a string):

```ts
export type CsvRow = { name?: string; company?: string; linkedinUrl?: string; email?: string; city?: string; region?: string; country?: string; locationRaw?: string };
export function parseCsvRows(text: string): CsvRow[]
```
Reuse the existing header-scan/boilerplate logic; map the new columns; for `location` free text → `parseLocationDisplayName` (import from subject-location) when city/region/country columns are absent. Per row, set `linkedinUrl` when a url cell is present, else `name`/`company`.

- [ ] Keep `csvToJobLines` (back-compat) but have the NEW client path use `parseCsvRows`.
- [ ] Tests: email column mapped; city/state/country mapped; `location` free-text split; positional fallback still works; boilerplate still stripped.
- [ ] Commit.

### Task B3: Client — submit structured CSV rows (NewJobForm)

**Files:** Modify `src/components/admin/NewJobForm.tsx`.

- [ ] On CSV ingest, instead of appending `csvToJobLines(...)` into the textarea, hold the parsed `parseCsvRows(...)` in component state and show a count ("N rows from CSV — including emails/locations where present"). Keep the textarea for manual paste.
- [ ] On submit, POST `{ input: <textarea text>, rows: <CsvRow[]>, model, title }` to `/api/admin/jobs`.
- [ ] Verify in the browser (or note manual verification — no DB locally).
- [ ] Commit.

### Task B4: `applyRowEnrichment` helper

**Files:** Create `src/lib/row-enrichment.ts`; Test `tests/lib/row-enrichment.test.ts` (pure mapping part).

- [ ] Implement:

```ts
import { upsertProfileEmail } from "./profile-emails";
import { writeSubjectLocation, parseLocationDisplayName, type SubjectLocation } from "./subject-location";

export type EnrichInput = { email?: string | null; city?: string | null; region?: string | null; country?: string | null; locationRaw?: string | null };

export function toSubjectLocation(e: EnrichInput): SubjectLocation {
  if (e.city || e.region || e.country) return { city: e.city ?? null, region: e.region ?? null, country: e.country ?? null, raw: [e.city, e.region, e.country].filter(Boolean).join(", ") || null };
  return parseLocationDisplayName(e.locationRaw);
}

export async function applyRowEnrichment(evaluationId: string, e: EnrichInput, byAdmin: string | null): Promise<void> {
  if (e.email) await upsertProfileEmail(evaluationId, e.email, "verified", "operator", byAdmin);
  const loc = toSubjectLocation(e);
  if (loc.city || loc.region || loc.country || loc.raw) await writeSubjectLocation(evaluationId, loc, "operator");
}
```

- [ ] Test the pure `toSubjectLocation` (structured wins; falls back to parse of locationRaw; empty → empty).
- [ ] Commit.

### Task B5: Rewrite `POST /api/admin/jobs` — enrich existing, queue new

**Files:** Modify `src/app/api/admin/jobs/route.ts`.

- [ ] Accept `rows: CsvRow[]` in the body; normalize each `CsvRow` into the unified `ParsedLine & Enrich` list alongside `parsePasteInput(input)`. (CSV rows → url or nameCompany kind + enrich fields.)
- [ ] Replace the dedupe-skip block (lines ~163-227): look up existing by url/name → build `existingByKey: Map<key, evaluationId>`. Partition items into `matches` (existing) and `fresh` (new). **Remove the `400 "all items already scored"`**.
- [ ] Insert the job with `totalItems = matches.length + fresh.length`. Insert items:
  - `fresh` → as today + the `input_*` enrichment columns; status `pending`/`resolved`.
  - `matches` → `evaluationId` set, `input_*` columns, status `enriched`, score snapshot copied from the existing eval (select founder/investor/combined + costTotalCents).
- [ ] After insert, for each match call `applyRowEnrichment(evalId, enrich, user.id)` (synchronous; bounded by paste size — cap parallelism with the existing `concurrency.ts` helper if many).
- [ ] Credit hold/estimate covers only `fresh` (matches are free). Adjust `estimateJobCents(fresh.length, model)`.
- [ ] Return `{ jobId, totalItems, enrichedExisting: matches.length, scored: fresh.length, ... }`.
- [ ] Test: a name/url that exists → routed to enrich (item `enriched`, eval got the email row); all-existing upload returns 200 (not 400). (Use the repo's route-test `vi.mock` pattern; mock db or run against test DB — match existing `tests/app` style; if DB-bound, assert the partition logic via an extracted pure helper.)
- [ ] Commit.

### Task B6: scoring-tick — apply enrichment to new profiles post-score

**Files:** Modify `src/app/api/cron/scoring-tick/route.ts`.

- [ ] Where a claimed item is scored (`runEval(...)` for fresh items), after success and before marking `done`, read the item's `input_*` columns and call `applyRowEnrichment(result.evaluationId, {email: inputEmail, city: inputCity, ...}, item.queuedBy ?? null)`. (Items with `status='enriched'` are already terminal and never claimed by the tick.)
- [ ] Ensure the claim query selects the new `input_*` columns.
- [ ] Test: covered by B5's helper; add an assertion that the tick passes input_* into applyRowEnrichment (light unit if feasible, else manual).
- [ ] Commit.

---

## Self-Review
- Covers spec §Part-3 ingestion (email+location extraction, structured CSV) ✓, §Part-4 enrich-existing (sync, no 400) ✓, enrichment application (sync for matches, post-score for fresh) ✓.
- Email→`profile_emails` (operator/verified) and location→`subject_*` via Plan A primitives ✓.
- The lossy `csvToJobLines` string path is bypassed for the new structured flow ✓.
