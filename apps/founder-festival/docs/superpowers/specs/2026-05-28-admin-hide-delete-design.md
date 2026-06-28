# Superadmin: Hide / Delete a Profile — Design

**Status**: Building autonomously per user's "build and ship" instruction
**Author**: DROdio (specced with Claude)
**Branch**: `admin-hide-delete-profile`

## Problem

A superadmin viewing someone's `/profile/<...>` page has no in-product way to (1) hide a low-quality profile from the leaderboard without nuking the row, or (2) delete a profile entirely. Today, both require direct DB intervention.

## Goals

- Superadmins (and only superadmins) can toggle a profile's "hidden from leaderboard" state from the profile page.
- Superadmins can delete a profile completely from the profile page, with a confirmation step.
- Hidden profiles still resolve at their canonical URL (the admin needs to be able to come back and unhide).

## Non-goals

- Hidden profiles still show up on admin pages (so the admin can find them again to unhide).
- Admin-delete does NOT delete the underlying Clerk user (more conservative than user-initiated delete — the auth identity stays intact in case they need it).
- No public-facing "explain why this was hidden" UI. Decision is implicit.
- No undelete. Delete is irreversible by design (matches user-initiated delete behavior).
- No new admin audit log table. The `hidden_by_clerk_user_id` column gives us audit for hide; delete is captured by Vercel logs.

## Decisions locked

| Topic | Decision |
| --- | --- |
| Hide is reversible | Yes — Hide / Show toggle. |
| Hide affects | Leaderboard only. Direct URLs + admin pages still work. |
| Delete cascade | evaluation + all dependent rows (score_items, badge_overrides, recommendation_responses, recommendation_visibility, scoring_job_items.evaluation_id → null, profile_slug_aliases, users claim rows). Does NOT delete Clerk user. |
| Confirmation | Hide is instant. Delete requires modal confirmation. |
| Gating | `isSuperAdmin()` check on every UI render + every API call. |

## Data model

### New columns on `evaluations`

```sql
ALTER TABLE evaluations ADD COLUMN hidden_at timestamp with time zone;
ALTER TABLE evaluations ADD COLUMN hidden_by_clerk_user_id text;
CREATE INDEX evaluations_hidden_at_idx ON evaluations(hidden_at);
```

`hidden_at IS NULL` = visible. Setting it to `NOW()` (with the actor's clerk id) hides the profile. Setting both back to `NULL` un-hides.

## API

### `POST /api/admin/profile/[evalId]/hide`

- Auth: `isSuperAdmin()` → 403 if not.
- Body: `{ hidden: boolean }` (explicit, so the toggle is idempotent across concurrent clicks).
- Effect: sets `hidden_at` to `NOW()` and `hidden_by_clerk_user_id` to the caller, OR clears both if `hidden === false`.
- Returns: `{ ok: true, hidden: boolean }`.

### `POST /api/admin/profile/[evalId]/delete`

- Auth: `isSuperAdmin()` → 403 if not.
- Body: none.
- Effect: cascades dependent rows then the evaluation. Does NOT touch Clerk.
- Returns: `{ ok: true }`. Client navigates the user away (to `/leaderboard`).

### Shared helper: `src/lib/profile-delete-cascade.ts`

Single source of truth for the "delete one evaluation and all its dependents" operation. Extracts the existing logic from `/api/account/delete` so the user-delete and admin-delete paths can't drift. Function signature:

```ts
export async function deleteEvaluationCascade(evaluationId: string): Promise<void>
```

The existing `/api/account/delete` route is refactored to use this helper (keeps the same external behavior; just shares code).

## UI

### `AdminProfileActions` (new client component)

Renders a row of two pills above the existing Leaderboard / Re-Score row on `/profile`. Visible only when `superAdmin` is true (passed from the server-rendered page).

```
[Hide]   [Delete]
```

When `hidden_at` is set: pill text flips to `[Show]` and gains a small dot indicator.

Behavior:
- **Hide / Show**: instant POST to `/api/admin/profile/<id>/hide`. Optimistic UI: button text flips before the request finishes; on error, reverts.
- **Delete**: opens a small confirmation modal. Modal copy: "Permanently delete this profile? All scores, claims, badges, and recommendations will be removed. This can't be undone." Two buttons: Cancel + "Yes, delete." On confirm: POST to the delete endpoint, then `router.push("/leaderboard")` on success.

### Placement

`/profile/page.tsx` — a new conditional block ABOVE the `<div className="flex items-center gap-3 mt-1 text-xs sm:text-sm">` row that holds the leaderboard pill and re-score link (around line 531). Gated on `superAdmin === true`.

```tsx
{superAdmin && (
  <AdminProfileActions
    evaluationId={row.id}
    initialHidden={row.hiddenAt !== null}
  />
)}
```

## Leaderboard filter

In `src/lib/leaderboard.ts`'s `baseWhere`:

```ts
const baseWhere = and(
  ne(evaluations.signalQuality, "low"),
  ne(evaluations.source, "code"),
  isNull(evaluations.hiddenAt),    // NEW
  ...TEST_HANDLE_PREFIXES.map((p) => notLike(evaluations.linkedinUrl, p)),
);
```

That's the only surface change. Profile URLs continue to resolve hidden profiles directly.

## Tests

| Layer | What |
| --- | --- |
| Unit | `deleteEvaluationCascade` deletes evaluation + all dependents (table-driven over the cascade list) |
| Integration | `/api/admin/profile/[id]/hide` — 403 for non-superadmin; toggles `hidden_at`; idempotent re-call with same state |
| Integration | `/api/admin/profile/[id]/delete` — 403 for non-superadmin; deletes eval; downstream rows are gone |
| Integration | Leaderboard query excludes rows with `hidden_at IS NOT NULL` |
| Manual | Profile page renders the buttons for a superadmin only; Hide toggle works; Delete modal blocks until confirmed and redirects after |

## Risks

- **Cascade correctness** — if a new dependent table is added in the future and the cascade list isn't updated, delete will fail with a foreign-key violation. Helper is the single source of truth; should be reviewed when adding new FK relationships.
- **Race on hide toggle** — two clicks in fast succession. Mitigated by requiring `hidden` in the request body so the second click is a no-op with the same target state.
- **Optimistic UI on hide** — if the network fails, the UI flip needs to revert. Component does this in the error branch.
