# Profile row privacy — design spec

Date: 2026-05-28
Branch: `worktree-profile`
Status: design approved; spec under user review.

## Problem / goal

On a Founder Festival profile page, the "Are these your current priorities?"
section lists rows (system-pre-populated and user-added custom rows). Today
every row is publicly visible to anyone with the profile URL. The owner needs a
way to hide individual rows from non-owners while still keeping them visible to
themselves.

Goals:

- Per-row Public/Private toggle, default Public.
- Claim-gated: a visitor who clicks the toggle on an unclaimed profile is
  funneled into the existing claim flow (same as the rating buttons).
- Private rows shown to non-owners as a **blurred** placeholder so visitors can
  tell a row exists and see structure, but cannot read the priority text or
  rating digits.

## Data model

New sparse table `recommendation_visibility`. A row exists only when the owner
has marked that priority as **private**. Absence of a row = public.

```ts
// src/db/schema.ts
export const recommendationVisibility = pgTable(
  "recommendation_visibility",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id),
    itemId: text("item_id").notNull(),
    // Only "private" rows are stored. Public = no row.
    visibility: text("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.evaluationId, t.itemId] }),
  }),
);
```

Trade-off considered: extending `recommendation_responses` with a `visibility`
column was rejected because that table requires `rating NOT NULL`, and privacy
must be settable on an unrated row.

## API

New endpoint mirroring the shape of `/api/recommendations`:

**`POST /api/recommendations/visibility`**

- Body: `{ evaluationId: string, itemId: string, visibility: "public" | "private" }`
- Auth gate identical to the existing recommendations endpoint:
  `isEvalOwner(userId, evaluationId) || isAdmin()`. Non-owners → 403.
- Behavior:
  - `visibility: "private"` → upsert a row in `recommendation_visibility`.
  - `visibility: "public"` → delete the row (table is sparse).
- Returns `{ ok: true }`.

**`DELETE /api/recommendations`** — no change. The existing handler is called
when a user un-rates a row (rating → null), which is independent of privacy
(a user may want to keep a row private but unrated). The `✕` button on custom
rows is purely client-side and does not call DELETE today, so it leaves orphan
rating rows in the same way it would leave orphan visibility rows — consistent
existing behavior.

## Server-side filtering

In `src/app/(authed)/profile/page.tsx`, after fetching saved responses, fetch
the set of private `item_id`s for the evaluation:

```ts
const privateRows = await db
  .select({ itemId: recommendationVisibility.itemId })
  .from(recommendationVisibility)
  .where(eq(recommendationVisibility.evaluationId, row.id));
const privateItemIds = new Set(privateRows.map((r) => r.itemId));
```

Then:

- **Viewer is owner or admin**: pass `privateItemIds: string[]` to
  `<Recommendations>` so the slider can show its current state. All text and
  ratings unmodified.
- **Viewer is non-owner**: before passing data, for each private item:
  - Replace `text` in `prePopulated` items with `null`.
  - Replace `editedText` in `savedResponses` with `null`.
  - Keep `rating`, `category`, `itemId`.
  - Set `isPrivate: true` flag on the item.

Priority text never reaches a non-owner's browser. Rating value is preserved so
the highlighted button position is visible (the user explicitly wants visitors
to see *that* a rating exists, even if the digit itself is blurred).

## UI — `<Recommendations>` updates

### `PrivacySlider` (inline component, like `RatingButtons`)

A small two-segment control with `Public` and `Private` labels.

- Both labels always visible. Active segment uses the gold `#dfa43a` bg + black
  text (matches the rating-button selected style). Inactive segments use the
  bordered zinc treatment.
- Hover the **Public** segment → tooltip text "Publicly visible".
- Hover the **Private** segment → tooltip text "Private just to you".
- Default state on rows with no `recommendation_visibility` row: **Public**
  highlighted.
- Click handler mirrors `rate()`:

  ```ts
  async function toggleVisibility(itemId: string, next: "public" | "private") {
    if (!isOwner) {
      setClaimOpen(true);
      return;
    }
    setVisibility((s) => ({ ...s, [itemId]: next }));
    await fetch("/api/recommendations/visibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evaluationId, itemId, visibility: next }),
    });
  }
  ```

### Row layout

Desktop (per row):

```
[category]  [text]   [1][2][3][4]
                       Soft Yes
                     [PUBLIC|Private]   ← gold on active segment
```

Mobile (row stacks): the slider stacks below the rating buttons in the
right-aligned column, same as the existing rating-buttons label row already
does.

### Blur treatment for non-owner viewing a private row

- Category badge: clear (helps the viewer know the row exists in a dimension).
- Text:
  - Rated row: render a fixed-width placeholder string proportional to the
    blurred row's expected text length (won't expose actual length — use a
    constant like 24 characters of `█`), then apply `filter: blur(4px)` and
    `select-none pointer-events-none`. No real text reaches the DOM.
  - Unrated row: same blurred placeholder.
- Rating buttons:
  - Rated row: all 4 drawn, the actual selected position uses the gold
    selected-state background. Digit text in all 4 buttons is blurred
    (`filter: blur(3px)`). Buttons are non-interactive (`pointer-events-none`).
  - Unrated row: all 4 drawn with the default bordered style, no selection
    highlight, digits blurred, non-interactive.
- Slider: hidden entirely (only owners + admins see it).

### Owner view

Slider always present. No blur. Slider state reflects `privateItemIds`.

## Edge cases

- **Re-rate a private row** → no change to visibility (separate table, separate
  upsert path).
- **Delete a rating** (set to null) → no change to visibility. Row remains
  private if it was private.
- **Delete a custom row** (`✕` button) → purely client-side today; rating
  row and visibility row both persist as orphans. Consistent with existing
  behavior; not a regression.
- **Admin viewing someone else's profile** → admins already pass `isEvalOwner`
  via `isAdmin()`, so they see everything unblurred and can toggle on behalf of
  the owner. Same behavior as today's rating buttons.
- **OG image / Score Detail modal / leaderboard / recommendation engine** →
  none of these surface priority text or per-row ratings, so no additional
  filtering needed.
- **Concurrent toggles** → optimistic UI; on API failure, revert (not required
  for v1, but `setVisibility` keyed by itemId means future revert is trivial).

## Testing

- Unit (`tests/api/`):
  - POST `/api/recommendations/visibility` with `visibility: "private"` upserts
    a row.
  - POST with `visibility: "public"` deletes any matching row.
  - 403 for non-owner, 401 for unauthenticated, 200 for admin.
- Integration (`tests/app/`):
  - Profile page server-rendered for a non-owner viewer: a private row's
    `text` and `editedText` are `null` in the data shape passed to
    `<Recommendations>`; `rating` and `category` preserved.
  - Same page rendered for the owner: text and rating intact;
    `privateItemIds` includes the marked rows.
- Manual: visit the profile as the owner, toggle a row private, log out (or
  view in an incognito window), confirm the row blurs with a visible rating
  highlight position.

## Out of scope for v1

- Section-level "make all priorities private" toggle.
- Privacy on other profile parts (score breakdown, badges, credibility radar,
  custom row category visibility).
- Audit log of who toggled what / when.
- Bulk operations (mark all private, mark all public).
- Owner notification when someone tries to view a private row.

## Files touched

- `src/db/schema.ts` — add `recommendationVisibility` table.
- `drizzle/` — generated migration.
- `src/app/api/recommendations/visibility/route.ts` — new POST handler.
- `src/app/(authed)/profile/page.tsx` — fetch private item IDs, filter
  text/editedText for non-owner viewers, add `isPrivate` flag.
- `src/components/Recommendations.tsx` — render `PrivacySlider`, hide it for
  non-owners, render blurred placeholders for private rows, wire claim-modal
  gate on toggle.
- `tests/api/recommendations-visibility.test.ts` — new.
- `tests/app/profile-private-rows.test.ts` — new.
- `PRD/worktree-profile.md` — progress update on commit.
