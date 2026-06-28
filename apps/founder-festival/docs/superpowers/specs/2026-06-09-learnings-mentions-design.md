# Learnings @mentions — Design

**Date:** 2026-06-09
**Status:** Approved design (user approved in chat), pending implementation plan
**Branch:** `learnings-mentions`

## Problem

On the admin event page, the "Learnings" editors (public + attendee-only) are
TipTap rich-text fields. Admins want to **@mention a Festival profile** while
writing learnings and have it render as a **clickable gold link to that person's
profile** in the published recap. Mentions resolve against **existing scored
profiles only** (the people in learnings are post-event attendees who've been
scored); there is no "create new person" path.

Display: the published mention shows **just the person's name** (no leading "@")
as a gold link, e.g. `Jensen Huang`.

## Why this is low-risk

The existing pipeline already supports it with no changes to storage, the save
API, the sanitizer, or the public render path:

- Both learnings fields share one editor — `RichTextEditor` (TipTap 3.26) — and
  save HTML via `editor.getHTML()` to `events.learnings_public` /
  `events.learnings_attendees` (text columns).
- The recap sanitizer `sanitizeRecapHtml` (regex-based) only strips
  `<script>`/`<style>`/`on*=`/`javascript:`. It **preserves `<a href>`, `class`,
  and `data-*`**, so a mention rendered as an anchor flows through untouched.
- The public recap renders learnings via `dangerouslySetInnerHTML` inside a
  container that styles all anchors gold (`[&_a]:text-[#dfa43a]`), so a mention
  anchor is automatically gold and clickable.
- Profile search already exists: `GET /api/leaderboard/search?q=` →
  `{ rows: LeaderboardRow[] }` where each row has `id` (evaluationId), `fullName`,
  `companyName`, `combinedScore`, `profileHref`.

So the work is entirely in the **editor**: add a TipTap Mention node that (a)
autocompletes profiles via the existing search and (b) serializes to a plain
anchor.

## Approach

### Mention node → anchor HTML
Add `@tiptap/extension-mention` (which brings `@tiptap/suggestion`). Configure a
Mention node whose stored attributes are `{ id, label, href }` (evaluationId,
fullName, canonical profileHref) and whose `renderHTML` emits:

```html
<a href="<profileHref>" data-mention-id="<evaluationId>" class="mention">Jensen Huang</a>
```

- **Name only**, no "@" (per the approved design).
- `href` = the canonical `profileHref` from search (always resolvable: profile
  slug URLs persist, and `/profile?e=<id>` is the permanent fallback, so a baked
  link never breaks even if the person later claims a username).
- `data-mention-id` = the evaluationId — future-proofing so we could re-resolve
  the link later if ever needed. Not used at render time in v1.
- `parseHTML` matches `a[data-mention-id]` so existing mentions round-trip back
  into the editor as mention nodes when re-editing learnings.

The mention node is an inline atom (single unit, not editable character by
character) — standard Mention behavior.

### Autocomplete (suggestion) UX
Trigger char `@`. On typing, debounce (~200ms) a query to
`/api/leaderboard/search?q=<text>` and show a dropdown of matching profiles
(name · company · score), styled like the existing `AttendeeManager` /
`HeaderSearch` dropdowns. Keyboard: ↑/↓ to move, Enter/Tab to select, Esc to
close. Selecting inserts the mention node with `{ id, label, href }` from the
chosen row and removes the typed `@query`.

Implementation note: use the Mention extension's `suggestion.render` lifecycle
with a **small React-rendered dropdown** (rendered into a positioned container).
**No `tippy.js` dependency** — we position a simple absolutely-positioned list at
the suggestion `clientRect`, matching the lightweight approach already used for
the other search dropdowns.

### Scope: opt-in, learnings only
`RichTextEditor` gains an optional `enableMentions?: boolean` prop. When true, the
Mention extension is added to the editor's extension list; otherwise the editor is
unchanged. `EventLearningsEditor` passes `enableMentions` to **both** its editors
(public + attendee). Other `RichTextEditor` usages are unaffected. Mentions link
**same-tab** (internal profile link — no `target="_blank"`).

## Files

- **`package.json`** — add `@tiptap/extension-mention` (^3.26, matching the other
  `@tiptap/*` pins); `@tiptap/suggestion` comes transitively (add explicitly if
  needed for the import).
- **New `src/components/admin/rich-text-mention.tsx`** — the configured `Mention`
  node (attrs + renderHTML + parseHTML) and the `suggestion` config (the
  debounced search + the React dropdown renderer with keyboard nav). One focused
  module so `RichTextEditor` just imports a ready extension.
- **`src/components/admin/RichTextEditor.tsx`** — add `enableMentions?: boolean`
  prop; conditionally include the mention extension in `useEditor`'s `extensions`.
- **`src/components/admin/EventLearningsEditor.tsx`** — pass `enableMentions` to
  both `RichTextEditor` instances.
- **No** changes to storage, the learnings save API, `sanitizeRecapHtml`, or the
  public recap page.

## Data flow

```
Admin types "@jen" in a learnings field
   → suggestion queries /api/leaderboard/search?q=jen  (existing endpoint)
   → dropdown of profiles (name · company · score)
   → admin picks one
   → Mention node inserted { id: evalId, label: fullName, href: profileHref }
editor.getHTML()  →  ...<a href="/profile/founder/jensen-huang"
                          data-mention-id="<evalId>" class="mention">Jensen Huang</a>...
   → POST /api/admin/events/[id]/learnings  (unchanged)
   → sanitizeRecapHtml keeps the anchor  →  stored in events.learnings_*
Public recap: sanitizeRecapHtml(stored) → dangerouslySetInnerHTML
   → renders a gold, clickable link to the profile (same-tab)
```

## Testing

- **Sanitizer round-trip (unit):** extend `tests/lib/event-recap.test.ts` —
  `sanitizeRecapHtml` preserves a mention anchor with `class="mention"`,
  `data-mention-id`, and an internal `href` (and still strips a `javascript:`
  href / `onclick`). This pins the invariant the whole feature relies on.
- **Mention render helper (unit):** a small pure function builds the mention
  attrs → anchor HTML (or assert the extension's `renderHTML` output) so the
  exact `<a>` shape is locked.
- **Editor/dropdown UX:** verified via `pnpm build` + manual smoke (type `@`,
  pick a profile, confirm the saved HTML contains the anchor, confirm it renders
  gold + clickable on the public recap).

## Open risks / notes

- **Stale href after claim:** baking the canonical `profileHref` could theoretically
  point at an old slug if a person later changes their username. Profile slug
  URLs persist and `/profile?e=<id>` always resolves, so links stay valid; the
  `data-mention-id` lets us add render-time re-resolution later if we ever want
  prettiest-URL guarantees. Out of scope for v1.
- **Re-editing existing learnings:** `parseHTML` on `a[data-mention-id]` brings
  saved mentions back as mention nodes; a plain `<a>` (manual link) stays a normal
  link. No migration needed — old learnings simply have no mentions.
- **Suggestion positioning:** the no-tippy dropdown must handle the caret near the
  viewport edge; acceptable to keep simple (position at the suggestion rect) for
  an admin-only tool.
