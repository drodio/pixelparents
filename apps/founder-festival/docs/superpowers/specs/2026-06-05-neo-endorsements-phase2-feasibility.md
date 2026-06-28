# Neo Phase 2 — Endorsement quotes on investor profiles (feasibility + decision)

**Date:** 2026-06-05
**Status:** DEFERRED pending operator go/no-go. Phase 1 (badges) + a deep-link
endorsements surface shipped in PR #175; the endorsement *quote* scrape is not
built. This doc is the decision artifact.

## Goal
Show the actual Neo endorsement quotes ("…read on Neo — Cyril Nader, Phenix Space
Co-Founder & CEO") inline on an investor's Festival profile, with each endorser's
name linking to their Festival profile when one exists.

## What shipped instead (PR #175, safe, no migration)
`src/components/NeoEndorsements.tsx` renders an "Endorsements" section that
deep-links to `neo.com/investor/<slug>` using the already-stored `neoSlug`
(gated on `onNeo === true`). Readers get to the real endorsements in one click;
we just don't render the quotes in-app yet.

## Feasibility findings (live-probed 2026-06-05)
The endorsement **content** is NOT reachable via plain HTTP:
- **Bubble Data API:** `GET /api/1.1/obj/endorsement` (and ~30 name variants) →
  `HTTP 404 {"status":"NOT_FOUND"}`. The type is real (the SPA's `dynamic.js`
  references `custom.endorsement`) but deliberately excluded from the public Data
  API, unlike `obj/user`/`obj/person`/`obj/company` which return 200.
- **Investor page** `neo.com/investor/<slug>`: a ~25 KB non-server-rendered
  Bubble SPA shell. Only SEO meta strings mention "endorse"; zero quote content
  in the initial HTML.
- **Client data path:** `/elasticsearch` exists but rejects anonymous/hand-built
  requests (`HTTP 400 ClientError`) — it needs a per-session app-version token +
  signed payload the SPA generates at runtime. `/api/1.1/init/data` → `[]`.

**Verdict:** getting quotes requires rendering the page in a real browser
(Playwright/Puppeteer), letting Bubble's `run.js` fetch via `/elasticsearch` with
its runtime token, then either intercepting that XHR JSON or scraping the DOM.

The endorsement **count** (`numEndorsements`) IS free on the existing `obj/user`
call (already fetched, not yet persisted).

Confirmed endorsement schema (from the SPA data dictionary): `text_text`,
`endorser_user`, `endorsee_user`, `backed_boolean`, `tags_list_text`,
`timestamp_date`, `likecount_number`. `endorser_user`/`endorsee_user` are Bubble
user `_id`s resolvable to names via the **public** `obj/user` API (no browser).

## Recommended architecture (if greenlit)
Do NOT put this in the inline enricher mesh (it can't share the ~3 s budget).
1. **Headless fetch on a separate path:** Playwright + `@sparticuz/chromium` in a
   dedicated Vercel Node function (own `maxDuration`/`memory`), invoked by a
   **cron backfill sweep** (mirror the lifecycle-email cron). Gate on
   `onNeo === true && numEndorsements > 0` so we only render slugs that have
   endorsements. Cache; re-fetch on a slow cadence.
2. **Endorser resolution stays cheap:** resolve `endorser_user` ids → names via
   the public `obj/user` API, then match endorser LinkedIn URLs against
   `evaluations.linkedin_url`. Hit → link to `/profile/<slug>`; miss → a fallback
   `/?q=<name>&company=<co>` search URL (note: the home SplashForm is
   LinkedIn-handle-only today, so that fallback is its own small design task).
3. **Storage:** new `neo_endorsements` table FK'd to `evaluations`, keyed by
   `(evaluationId, endorsementUid)` for idempotent upsert. Draft schema:
   ```ts
   neoEndorsements: id, evaluationId(FK cascade), neoSlug, endorsementUid,
     text, endorserUserId, endorserName, backed, tags(text[]), endorsedAt,
     likeCount, fetchedAt
   ```
   Requires a new migration (next is 0033) applied **manually to prod**
   (`ep-fragrant-surf`) via the documented `sql.query()`-over-HTTP path.
4. **UI:** replace the deep-link in `NeoEndorsements.tsx` with truncated quotes +
   endorser links + the "read on Neo →" link as the see-all.

## Risks / why it was deferred
- New heavy dependency (`@sparticuz/chromium` ~50 MB), slow cold starts, near the
  function memory/time ceiling — and brittle against Bubble DOM/token changes.
- Cannot be verified in Vercel's serverless runtime from a local checkout.
- Requires a prod migration + a new cron — an architecture commitment the
  operator should own, not something to auto-ship unattended.

## Recommendation
Two viable next steps, smallest first:
- **(A) Count-only, ~1 hr, low risk:** persist `numEndorsements` (one nullable
  column → one prod migration) and show "N endorsements" beside the existing
  deep link. No browser. Gets most of the perceived value.
- **(B) Full quotes, multi-day, the real Phase 2:** the cron + headless-browser
  architecture above. Do only if inline quotes are worth the Playwright
  dependency and ongoing scrape-maintenance burden.
