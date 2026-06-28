# Nickname + Editable Profile URL — Design

**Status**: Approved (verbal, in chat 2026-05-28)
**Author**: DROdio (specced with Claude)
**Branch**: `nickname-and-slug-editor`

## Problem

Two related gaps in the claimed-profile experience:

1. No way for a user to set how they're addressed. The profile heading and welcome emails always render the full name (which is itself often pulled from LinkedIn and may not be how the user actually wants to be greeted).
2. The profile URL is set once at score time and is immutable. Users can't pick `/founder/<slug>` vs `/investor/<slug>` as their canonical URL, and they can't change the slug if it doesn't represent them well.

## Goals

- Claimed users can set a **nickname**, which replaces the "Welcome [Full Name]" heading on their profile and overrides the welcome-email greeting.
- Claimed users can edit their **profile URL** by picking a default role (`founder` / `investor`) and a slug. The previously non-canonical role URL and the previously used slug both continue to resolve via 301 redirect.
- For every profile (claimed or not), both `/founder/<slug>` and `/investor/<slug>` must resolve — either by direct serve (the canonical role) or by 301 redirect to the canonical URL.

## Non-goals

- Not introducing first/last name columns. Clerk owns user identity; the schema does not, and we are not going to start duplicating that.
- Not changing how `clerkUsername` URLs work (`/profile/<clerkUsername>` keeps taking precedence over slug URLs).
- Not touching the score-based pick of `slugKind` for unclaimed profiles — the default canonical role still follows the higher score until a claimed user picks otherwise.
- Not building admin tooling for slug history (the alias table is implementation detail).

## Decisions locked from brainstorming

| Topic | Decision |
| --- | --- |
| URL semantics | Both `/founder/<slug>` and `/investor/<slug>` resolve for every profile. The "canonical role" is `evaluations.slugKind`; the non-canonical role URL 301-redirects to it. |
| Slug uniqueness | Slugs become **globally unique** across roles. One-time migration auto-suffixes any cross-role collisions in current data. |
| Slug history | When a claimed user changes their slug, the old slug is stored in a `profile_slug_aliases` table and 301-redirects to the current canonical URL. Old slugs stay reserved (nobody else can claim them). |
| Nickname display | Replaces "Welcome [Full Name]" as the profile heading. Full name appears as a smaller subtitle directly below. When nickname is unset, current full-name behavior continues. |
| Nickname in emails | When set, nickname wins over Clerk `firstName` in `firstNameFor()`. |

## Data model

### New column on `users`

```sql
ALTER TABLE users ADD COLUMN nickname text;
-- CHECK: trimmed length 1..32, no leading/trailing whitespace, no newlines.
```

Enforced at the application layer (server action validation). No DB CHECK constraint (avoids migration drift if rules evolve).

### Schema change on `evaluations`

```sql
-- Drop existing per-role uniqueness:
DROP INDEX evaluations_slug_kind_slug_unique;

-- Replace with global uniqueness:
CREATE UNIQUE INDEX evaluations_slug_unique ON evaluations(slug);
```

Migration step before adding the new index:

```sql
-- Detect cross-role slug collisions:
SELECT slug, COUNT(*) FROM evaluations
WHERE slug IS NOT NULL
GROUP BY slug HAVING COUNT(*) > 1;
```

For each collision: keep the **oldest** row's slug as-is; for the others, append `-2`, `-3`, ... using the existing `ensureUniqueSlug` logic in `src/lib/profile-slug.ts` (extended to also consult `profile_slug_aliases` once that table exists).

Migration file lives in `drizzle/` and is generated via `pnpm db:generate` after the schema change. The migration is **safe to re-run** (it's a no-op once collisions are resolved).

### New table `profile_slug_aliases`

```sql
CREATE TABLE profile_slug_aliases (
  alias_slug text PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX profile_slug_aliases_evaluation_id_idx ON profile_slug_aliases(evaluation_id);
```

A slug is "taken" if it appears in `evaluations.slug` OR `profile_slug_aliases.alias_slug`. Both are PRIMARY KEY / unique-indexed, so the lookup is two single-row index scans.

### Why a separate alias table

Considered putting historical slugs in a JSONB array on `evaluations`. Rejected because: uniqueness query becomes a gin-index scan, the redirect lookup gets messier, and ON DELETE CASCADE wouldn't be automatic for the array case.

## Routing & redirect logic

### Profile lookup at `/profile/[handle]/[slug]`

`handle ∈ {founder, investor}`. New logic in `src/app/(authed)/profile/[handle]/[slug]/page.tsx`:

```
1. SELECT e FROM evaluations WHERE slug = $slug LIMIT 1
2. If hit:
     - If e.slug_kind === handle: render the profile.
     - Else: 301 redirect to /profile/<e.slug_kind>/<slug>.
3. Else, SELECT a FROM profile_slug_aliases WHERE alias_slug = $slug LIMIT 1
4. If alias hit:
     - SELECT e FROM evaluations WHERE id = a.evaluation_id
     - 301 redirect to /profile/<e.slug_kind>/<e.slug>
5. Else: notFound().
```

The `/profile/<clerkUsername>` route at `src/app/(authed)/profile/[handle]/page.tsx` is untouched. So is the legacy `/profile?e=<uuid>` form.

### Slug edit transaction

In `src/lib/profile-slug-edit.ts` (new):

```
BEGIN
  Validate new_slug (regex + length, lowercase, no leading/trailing dash, no consecutive dashes).
  If new_slug !== current_slug:
    Verify new_slug NOT IN (evaluations.slug ∪ profile_slug_aliases.alias_slug).
    INSERT INTO profile_slug_aliases (alias_slug, evaluation_id) VALUES (current_slug, eval_id).
    UPDATE evaluations SET slug = new_slug WHERE id = eval_id.
  If new_slug_kind !== current_slug_kind:
    UPDATE evaluations SET slug_kind = new_slug_kind WHERE id = eval_id.
COMMIT
```

The uniqueness check inside the transaction is racy in principle (two concurrent saves could both pass the check), but the unique index on `evaluations.slug` and the PRIMARY KEY on `profile_slug_aliases.alias_slug` are the real defense — they'll throw on conflict and the server action catches and returns `slug_taken`.

## UI

### `/account` page additions

New section titled "Profile URL & Nickname", gated on the user being claimed (existing `users` row check). Renders below the existing notification preferences.

Fields:

- **Nickname** — `<input type="text">`, optional. Maxlength 32, single-line. Helper text: "How we'll address you in greetings and on your profile." Below the input, live preview block:

  ```
  Welcome Daniel
  Daniel Odio
  ```

- **Default URL role** — `<select>` with two options, `founder` and `investor`. Helper text: "Both URLs will keep working — this just picks the one we use in share links and SEO."

- **Slug** — `<input type="text">` pre-filled with the current slug. Live validation (regex `[a-z0-9-]{1,64}`, no leading/trailing dash, no consecutive dashes). Live preview: `https://festival.so/profile/<role>/<slug>`.

Save button submits to a new server action `updateProfileSettings({ nickname?, slugKind?, slug? })`. Inline error display under each field. No optimistic UI — the form disables while the request is in flight.

### Profile heading change

In `src/app/(authed)/profile/page.tsx`, the heading currently reads `Welcome {fullName}` (around line 469). Change to:

- If a claimed user with nickname set:
  ```
  <h1>Welcome {nickname}</h1>
  <p class="text-sm text-muted">{fullName}</p>
  ```
- Else: current behavior unchanged.

The nickname is fetched via the existing users-join logic on the page; if not present, fall through to current behavior.

### Welcome email greeting

`firstNameFor()` in `src/lib/welcome-emails.ts` gains a new first parameter:

```ts
export function firstNameFor(
  nickname: string | null | undefined,
  clerkFirstName: string | null | undefined,
  fallbackName?: string | null,
): string {
  const firstToken = (s: string | null | undefined) =>
    s?.trim().split(/\s+/)[0] || undefined;
  // Nickname is the user's chosen display name — use it whole (no first-token reduction),
  // since "DROdio" or "Mary Beth" are both legitimate full nicknames.
  const n = nickname?.trim() || undefined;
  return n ?? firstToken(clerkFirstName) ?? firstToken(fallbackName) ?? "there";
}
```

The sweep query in `src/lib/welcome-email-sweep.ts` adds `nickname` to its select on `users` and passes it as the first arg.

### Note on the nickname-vs-firstToken distinction

The Clerk `firstName` and DB-fallback paths run through `firstToken()` because they're not user-curated (Clerk's `firstName` may contain a full name, the DB `fullName` is always a full name). The nickname is user-curated specifically as the display string, so it's used as-is. This is intentional.

## Validation rules

### Slug

- Length 1–64 (we cap at 64 to avoid pathological URLs; existing data is well under this).
- Regex: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (alphanumeric + single hyphens, no leading/trailing/consecutive hyphens).
- Reserved keywords blocked (`founder`, `investor`, `api`, `profile`, `admin`, `dev`, `account`, `claim`, `developers`, etc. — to avoid route collisions in case the URL structure ever changes).
- Case-insensitive uniqueness — normalize to lowercase on input.

### Nickname

- Trimmed length 1–32.
- No newlines or control characters.
- HTML-escaped on render (existing `escapeHtml()` already handles this).

### Role

- Must be `founder` or `investor`.

## Tests

| Layer | What | Where |
| --- | --- | --- |
| Unit | `nameToSlugBase` / `ensureUniqueSlug` updated to check aliases too | `tests/lib/profile-slug.test.ts` |
| Unit | New slug validator (chars, length, reserved words) | `tests/lib/profile-slug-edit.test.ts` (new) |
| Unit | `firstNameFor(nickname, clerk, fallback)` precedence | `tests/lib/welcome-emails.test.ts` |
| Unit | Nickname validator | `tests/lib/profile-nickname.test.ts` (new) |
| Integration | Slug-edit transaction inserts alias + updates eval | `tests/lib/profile-slug-edit.integration.test.ts` (new, gated on DATABASE_URL) |
| Integration | Lookup decision table — direct hit, cross-role hit, alias hit, miss | `tests/profile/lookup.integration.test.ts` (new) |
| Visual | Profile heading shows nickname when set, full name as subtitle | manual smoke on `localhost:3001` |
| Visual | Account page shows new section only when claimed | manual smoke |

## Migration risk & rollout

The migration that drops the per-role unique index and adds the global one will auto-suffix any cross-role slug collisions in current data. **Before merging this PR**:

1. A read-only query reveals exactly which `(slug)` values appear under both roles in prod.
2. PR description lists those rows so the maintainer can sanity-check the auto-suffix decisions.
3. If the list is empty, the migration is purely structural and safe.

The PR will not auto-merge. Maintainer reviews and decides.

## Open questions deferred

- Should there be an admin override for slug edits? (Out of scope for v1.)
- Should slug edits be rate-limited? (Out of scope; can add later.)
- Should the alias table prune after N years? (Out of scope; URLs are forever.)
