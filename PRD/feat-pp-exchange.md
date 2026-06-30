# PRD — feat/pp-exchange (bidirectional "Exchange")

## Progress Update as of [June 30, 2026 — 2:57 AM Pacific]

### Summary of changes since last update
First entry. Evolved the one-directional "Asks" connector (PR #109) into a
bidirectional **"Exchange"** where any verified OHS family (parent OR student)
can post an **Ask** ("I need help") or an **Offer** ("I can help"), and anyone
can respond to either. Renamed the section + route to Exchange, added a kind
split + full filter/sort controls, author profile cards, creator CRUD + resolve,
urgency + optional expiry, and reconciled the matcher bidirectionally. All
validation green: `tsc --noEmit` clean, `eslint` clean (0 problems), `vitest`
320 passed, `next build` succeeds with all `/exchange/**` routes present.

### Detail of changes made
- **DB (self-heal, table kept as `asks`):**
  - `lib/db/schema/asks.ts`: added `kind` ('ask'|'offer', default 'ask'),
    `urgency` ('low'|'normal'|'high', default 'normal'), `validUntil` (timestamptz
    NULL), `resolvedAt` (timestamptz NULL). Status now includes 'resolved'.
  - `lib/db/ensure.ts` (`ensureAsksSchema`): idempotent `ADD COLUMN IF NOT EXISTS`
    for kind/urgency/valid_until/resolved_at (+ CREATE shape updated) + new
    `asks_kind_status_idx`. Old one-directional tables upgrade in place. Every
    read path still calls ensure (country-column P0 lesson honored).
  - `lib/db/asks.ts`: added `AskKind`/`AskUrgency` types + `ASK_KINDS`/
    `ASK_URGENCIES`. `listOpenAsks` now sorts **created_at ASC** (oldest open
    first — the default). Added `listAllAsks` (open+resolved+matched, excludes
    closed). New author-scoped writes: `updateAsk`, `deleteAsk` (cascades),
    `setAskResolved` (open↔resolved toggle, sets/clears resolved_at). All scoped
    by `authorSignupId` in the WHERE = the authorization (0 rows → null no-op).
- **Validation (`lib/ask-validate.ts`):** added `validateKind`, `validateUrgency`
  (empty → 'normal'), `validateValidUntil` (optional, must parse + be future;
  `now` injectable for tests).
- **Matcher (`lib/ask-matching.ts`):** removed the student exclusion — anyone can
  help now. `isStudent` kept on the candidate for the card badge only.
- **Pure filter/sort seam (`lib/exchange.ts`, NEW):** `filterAndSortPosts`
  (kind/status/tags/sort/expiry/my-posts), `isExpired`, `isExpiringSoon`,
  `distinctTags`. Default sort = recency ASC (oldest first); urgency sort with
  asc/desc; ties break oldest-first.
- **Route rename:** `app/(authed)/asks/**` → `app/(authed)/exchange/**` (git mv,
  history preserved). `next.config.ts` redirects `/asks` + `/asks/:path*` →
  `/exchange` (308). Nav tab in `components/dashboard-shell.tsx` relabeled
  "Asks" → "Exchange", href `/exchange`.
- **UI:**
  - `exchange-board-client.tsx`: segmented **Asks|Offers|All** kind split;
    status (Open/Resolved/All), recency + urgency sort toggles (asc/desc),
    show-expired checkbox, "My posts" checkbox, expertise-tag facet (reused chip
    pattern). Cards show kind/urgency/resolved/expiry badges, author name +
    parent/student badge.
  - `[id]/page.tsx` (detail): two-column layout — post + responses on the left,
    **author profile card** on the right (name, parent/student badge, expertise
    tags, visibility-gated `/community/<token>` link), plus suggestions relabeled
    by direction. Creator-only `PostControls` bar. Response wording flips by
    direction (offer-to-help vs request).
  - `new/post-form.tsx`: shared create/edit form (kind selector, title, body,
    tags, urgency, optional valid-until date).
  - `[id]/edit/page.tsx` (NEW): author-gated edit page (non-author redirected).
  - `[id]/post-controls.tsx` (NEW): edit link + mark-resolved/reopen toggle +
    delete-with-confirm dialog (all server actions re-check authorship).
  - `[id]/offer-help-form.tsx`: direction-aware copy via a `kind` prop.
  - `actions.ts`: removed student-can't-help restriction; added kind/urgency/
    validUntil to create; added `updateAskAction`, `deleteAskAction`,
    `setAskResolvedAction`. All author-scoped server-side.
- **Icons (`components/icons.tsx`):** added `IconPencil`, `IconTrash` (no emoji).
  Resolve uses existing `IconCircleCheck`; expiry uses existing `IconClock`.
- **Tests:** updated `ask-matching.test.ts` (students now match);
  `ask-validate.test.ts` (+kind/urgency/validUntil); NEW `exchange.test.ts`
  (default sort, kind split, urgency/recency toggles, expiry, status, tag +
  my-posts facets).

### Potential concerns to address
- "Exchange" is a naming choice — the user may want a different label (it's
  trivial to change: nav label + page copy + metadata; route can stay).
- Privacy: author profile card LINK is gated by `isDirectoryVisible` (same gate
  as directory/`/p`); students coarsened to first name only; signed-out/
  unverified see the verify gate before any DB read. Verified-OHS gating intact.
- The board now fetches all non-closed posts (open+resolved+matched) and filters
  client-side. Fine at community scale; if the table grows large, consider
  server-side pagination/filtering later.
- `valid_until` from a `<input type="date">` is interpreted at UTC midnight via
  Date.parse — close enough for a coarse expiry; revisit if timezone precision
  matters.
