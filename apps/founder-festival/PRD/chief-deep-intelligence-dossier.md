## Progress Update as of 2026-06-19 (evening Pacific, #3 — merge main, renumber to 0062)
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (it had advanced ~5 commits, incl. its own migration
`0061_cute_junta`). My migration collided on the 0061 number, so I dropped my
`0061_redundant_black_bird` and **regenerated the profile_dossiers migration as
`0062_clear_sumo`**. Took main's drizzle journal/snapshot; schema.ts auto-merged
(profileDossiers + main's changes). NOTE: dev DB already has the table (applied as
0061 earlier) — `0062` is the same CREATE; prod gets `0062`.

---

## Progress Update as of 2026-06-19 (evening Pacific, #2 — roborev fixes)
*(Most recent updates at top)*

### Summary of changes since last update
Addressed the roborev review on the feature commit. Most important: the profile
page no longer hard-depends on `profile_dossiers` existing.

### Detail of changes made:
- **`getProfileDossier` is fail-safe** (try/catch → null). If migration 0061 isn't
  applied yet, the profile page degrades to "no dossier box" instead of 500ing —
  removes the deploy-ordering footgun entirely.
- **`isDossierViewable` requires `https://`** on the share URL (anchor-href scheme
  guard) before rendering the link.
- **Skip the dossier lookup for `source === "code"`** profiles (the box never renders
  there) — no wasted DB round-trip.
- **CreditsModal: Escape closes** the dialog (focus-trap left out as YAGNI for a
  5-button modal).
- Left `ChiefOut.credits` required-or-null: the personalized route always forwards
  `credits` from `generatePersonalizedChief`, so the type is accurate.

---

## Progress Update as of 2026-06-19 (evening Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Built the Chief "Deep Intelligence dossier" box on the profile page,
plus the Chief credit-metering plumbing discovered this session. Branch was cut
fresh off `origin/main` (the old `nfx-bookmarklet-cookie` branch was already merged
via #392, and was 30 commits behind main with stale migrations) to avoid a
migration-number collision — this branch adds migration **0061**.

### Detail of changes made:
- **Chief credit metering** (`src/lib/chief.ts`): the Chief API now returns
  `ingress_credits`/`egress_credits`/`total_credits` on the per-message GET
  (`/v1/chats/{chat}/messages/{message}`). `ChiefResult` gained `credits`, threaded
  through `personalized-learnings.ts` and shown in the `PersonalizedEval` admin panel
  (replaces the old "credits not exposed" note). No separate `/usage` endpoint exists.
- **New table `profile_dossiers`** (migration `0061_redundant_black_bird.sql`):
  one row per evaluation — `share_url` (the public `chief.bot/shared/chat/<token>`
  link), `chat_id`/`message_id`, `status` (`ready|running|failed`), `total_credits`,
  `model`, `intelligence`, `raw_markdown`, timestamps. FK → `evaluations.id` cascade.
- **`src/lib/profile-dossier.ts`**: `getProfileDossier(evalId)` + `isDossierViewable`
  ("ready" + has `share_url`).
- **`src/components/ProfileDossierBox.tsx`** (client): below the Leaderboard/Tokenmaxxer
  pills, same box style as Member Endorsements. Two states —
  (a) has dossier → whole box links to the Chief share URL ("View the Deep Intelligence
  dossier on <name>"); (b) none → "Run a deep intelligence dossier on <name>" which
  expands to a blurb + **Run Now**. Run Now opens a credits modal that REUSES the
  /developers buy-credits flow (Clerk register/sign-in + `CREDIT_PACKS` →
  `/api/developers/checkout`) with the copy "Deep Intelligence dossiers cost $50 each."
- **`src/app/(authed)/profile/page.tsx`**: fetch `getProfileDossier(row.id)`, render the
  box (gated on `row.source !== "code"`), name = `nickname ?? fullName`.
- Verified locally (dev server): drodio (seeded dossier) shows the View state + real
  share link; a dossier-less profile shows the Run state. tsc clean; lint clean on new
  files (the 2 lint hits in profile/page.tsx are pre-existing, unrelated lines).

### Chief API facts established this session (for the next LLM):
- Auth: `X-API-Key` + `X-Project-Id` headers. Token/project ROTATED 2026-06-19
  (new PAT, project `project_d8eg1j5stbls738bpchg`) — old token returned 401 expired.
  Updated in `.env.local`; **Vercel prod/dev still on the OLD key** (TODO).
- Deep research: `POST /v1/chats {intelligence:"research", public_data:true}` →
  poll the message GET. drodio run = **41,585 credits**, ~9.5 min, 34KB cited dossier.
- Secret link: `POST /v1/chats/{id}/share` → `{is_shared,url,created_at}`;
  `GET` checks status; `DELETE` revokes. The share page is public (HTTP 200, no auth).

### UI polish (per DROdio, this session):
- Two lines, left-justified: "View/Run … dossier" / "for <name>"; name stays gold.
- No diagonal arrow; the whole View box is one clickable `<a>`.
- Uses the **dark-mode** logo `chief-logo-gold-crown-white-text-dark-mode.png` (added to
  the repo, `h-[38px]`), with a gold "Chief" wordmark fallback on load error.
- "Run Now" centered. Checkout `buy()` parses defensively — a 500/empty body (e.g.
  Stripe key not set locally) now shows a clear message, not "Unexpected end of JSON".

### Potential concerns to address:
- **Run Now is a payment gate only.** It opens the buy-credits modal; it does NOT yet
  kick off a real Chief research run or debit credits on completion — that flow is
  deferred (pending product direction).
- **Prod migration required with the deploy.** Migration 0061 creates `profile_dossiers`;
  `profile/page.tsx` queries it, so the table MUST exist before the new code serves or
  every profile page 500s. Apply 0061 to prod BEFORE merging.
- **drodio prod dossier seed** (share link + raw markdown from the 41,585-credit run) is
  optional but needed for the View state to show on prod `/drodio`; else it shows "Run".
- **Vercel Chief env** still on the OLD expired key (separate from this feature, but the
  personalized-learnings Chief path is broken on prod until it's rotated).
