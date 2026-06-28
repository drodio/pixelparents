# dossier-checkout-flow

## Progress Update as of 2026-06-19 08:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev #77. Hardened the `returnTo` open-redirect validation
(VALID finding): replaced the `^/(?!/)` regex — which allowed `/\host`,
control chars, and query injection — with reject-`[\\\r\n]` + `new URL(returnTo,
origin)` and a strict `u.origin === origin` check, keeping only `pathname +
search`. Declined the "stale balance after top-up" finding: Stripe is a full
external redirect, so the profile reloads fresh and the modal refetches balance
on its next open — nothing persists stale across a reload.

## Progress Update as of 2026-06-19 08:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two fixes to the Chief Deep Intelligence dossier credit modal: (1) after Stripe
checkout the buyer now returns to the founder profile they started from (not
/developers), and (2) the modal shows the viewer's current credit balance and
stops hard-selling credits when they already have enough.

### Detail of changes made:
- `src/app/api/developers/checkout/route.ts` — accepts an optional `returnTo`
  relative path (validated `^/(?!/)` to prevent open-redirect; defaults to
  `/developers`, preserving the original top-up flow). success_url/cancel_url now
  use it.
- `src/components/ProfileDossierBox.tsx` (CreditsModal):
  - Passes `returnTo: window.location.pathname` so checkout returns to this
    profile.
  - Fetches `/api/developers/credits` on sign-in and shows "Credit balance: $X".
  - When balance ≥ $50 (`DOSSIER_COST_CENTS`), reframes the copy: "You have
    enough credits…" and the buy grid becomes "Add more credits (optional)" —
    no longer forces buying.

### Potential concerns / remaining work:
- **The actual "run the dossier + deduct $50" backend is NOT built.** The modal
  is still only a credit gate — clicking a pack buys credits; there is no
  in-app run action yet. Building it needs: a run endpoint (balance check +
  reserveCredits($50) + `chiefSubmit`), a `profile_dossiers` "generating" row, a
  dossier-sweep cron (`chiefPoll` → ready/failed + refund on failure, mirroring
  `chief-insights-sweep`), AND a product/LEGAL decision on how the result is
  shown: the Chief API returns NO share URL (the seeded dossier's shareUrl was
  hand-provided), so the result must be rendered on our own page from
  `raw_markdown` — and per the chief-deep-research note the dossier has
  ADMIN-ONLY, defamation-risk sections, so "who can view what" must be decided
  before exposing it. Overlaps the parallel Chief work (ff-23f). Deferred pending
  that decision.
