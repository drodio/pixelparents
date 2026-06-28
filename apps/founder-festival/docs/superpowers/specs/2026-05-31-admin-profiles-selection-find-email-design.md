# Admin Profiles: row selection + infinite scroll + Tools / Find Email

**Date:** 2026-05-31
**Branch:** `email-related-work`
**Status:** Approved design, pending implementation plan

## Goal

On `/admin/profiles`, let an admin select rows and run bulk "Tools" against the
selection. The first tool is **Find Email**, which looks up emails via
AnyMailFinder and charges $0.05 per email found to the acting admin's credit
balance. Also fix the current hard `LIMIT 200` so all profiles are reachable by
scrolling (infinite scroll).

Builds directly on the already-shipped **User / Email / Email Status** columns:
a found email lands in the **Email** column with **Email Status = Unverified**.

## Decisions (from brainstorming)

- **Charge model:** $0.05 **per profile, only on a hit** (AnyMailFinder
  `email_status === "valid"`). Risky / not_found / blacklisted cost nothing.
- **Lookup input:** strongest available signal — `linkedin_url` (always present)
  + `full_name` + company `domain` when known. Sent to the person endpoint.
- **Target rows:** only selected rows with **no known email** (unclaimed AND no
  stored found-email). Skip claimed (already verified) and already-found.
- **Super-admins bypass the charge** (run Find Email free). Regular admins are
  charged and must have a funded balance.

## AnyMailFinder API contract (verified)

- `POST https://api.anymailfinder.com/v5.1/find-email/person`
- Auth: `Authorization` header with the `ANYMAILFINDER_API_KEY` (stored in Vercel,
  all envs). Bearer format to be confirmed against the auth doc during impl.
- Request (JSON): any of — `linkedin_url` alone; `full_name`/`first_name`+`last_name`
  with `domain` or `company_name`; or all three. We send what we have.
- Response (HTTP 200):
  ```json
  { "credits_charged": 1, "email": "...", "email_status": "valid|risky|not_found|blacklisted", "valid_email": "...", "person_full_name": null, "person_company_name": null, "person_job_title": null }
  ```
- **Billing: AnyMailFinder charges only when `email_status === "valid"`.** Our
  "hit" definition therefore equals `valid`, and our admin charge mirrors their
  per-find billing 1:1.
- Status codes: 200 ok, 400 bad input, 401 bad key, 402 insufficient AMF credits.

## Part A — Infinite scroll

Keep the existing client-side sort/filter (operates on loaded rows); stream rows
in progressively rather than loading thousands at once.

- **Extract a shared row builder.** Today's inline `profiles.map(...) +
  resolveEmails(...)` in `page.tsx` becomes one server helper (e.g.
  `buildProfileTableRows(profiles)`) so the page and the new API route serialize
  rows identically and cannot drift.
- **New endpoint:** `GET /api/admin/profiles/list?cursor=<updatedAt>,<id>&limit=100`
  → next page of `ProfileTableRow`. Cursor = keyset on `(updatedAt DESC, id DESC)`
  matching the existing order. Honors the same RBAC `ownerEmail` scope as the page.
- **Page render:** first 100 rows + the **real total count** (`COUNT(*)` over
  `source='url'`, owner-scoped). Header changes from "200 profiles" to
  "Showing X of Y".
- **Client:** IntersectionObserver sentinel at the table bottom fetches the next
  page until exhausted, appending to the in-memory list.
- **Filter caveat fix:** the table's documented note says the filter `enabled`
  set is seeded once at mount; with client fetching we must add newly-seen labels
  to `enabled` via an effect as pages stream in.

## Part B — Selection UX

- Leftmost **checkbox column**, before the Profile/name cell.
- **Header checkbox** toggles all **currently-loaded** rows (indeterminate when a
  partial selection exists).
- **Shift-click range:** track an anchor index on plain checkbox click; a
  shift-click selects the contiguous range between anchor and target in the
  current sorted/filtered order.
- State in the table component: `selected: Set<string>` (evaluation ids) +
  `anchorIndex: number | null`.
- **Deferred (YAGNI):** "select all N across the DB" (Gmail-style). v1 select-all
  = loaded rows; to act on everyone, scroll to load all then select-all.

## Part C — Tools panel + Find Email

- **Tools toolbar** rendered at the top of the table area (below Runs, above the
  grid), visible only when ≥1 row selected:
  `N selected · [Find Email] · Clear`, plus a cost hint
  (`$0.05 per email found`, or `free (super-admin)`).
- **Find Email** → `POST /api/admin/profiles/find-email` with `{ evaluationIds }`.
- **Server route:**
  1. Admin gate; capability **`run_scoring_jobs`** (the existing "can incur cost"
     grant). Super-admins always allowed.
  2. Re-derive **eligibility server-side** (only no-known-email rows). Never trust
     the client's list.
  3. Pre-flight (non-super-admins): show/return current balance; worst-case cost =
     eligible × $0.05.
  4. For each eligible profile: call AnyMailFinder with `linkedin_url` + `full_name`
     + `domain`. Modest concurrency; **cap 100 per click** for v1, synchronous,
     `maxDuration = 300`.
  5. On `email_status === "valid"`: store the found email as **unverified**; if not
     super-admin, `reserveCredits($0.05)` (new ledger reason `find_email_debit`).
     Non-valid results store nothing and cost nothing.
  6. If a non-super-admin's balance runs dry mid-batch: stop, report
     "found X, charged $Y, stopped — insufficient credits."
  7. Return per-row results; client updates so found emails appear in the **Email**
     column as **Unverified**.

## Storage (DB migration)

Add to `evaluations`:

- `found_email text`
- `found_email_status text` — AnyMailFinder status we accepted (`valid`)
- `found_email_at timestamptz`
- `found_email_by text` — Clerk id of the admin who ran it (audit)

One found email per profile (AnyMailFinder returns one best email). Generate a
drizzle migration following the existing migration pattern.

`profileEmailInfo()` extends to take the eval's found-email fields: for an
**unclaimed** profile with a `found_email`, return
`{ claimed: false, emails: found_email, emailStatus: "unverified" }`. Claimed
profiles are unchanged (Clerk verified emails).

## Credit ledger

New `reason` value `find_email_debit` (text column — additive, no enum change).
Reuse `reserveCredits`-style atomic debit so concurrent runs can't overspend; a
new helper if the existing one is too `score_debit`-specific.

## Out of scope (deferred / YAGNI)

- Async job + cron tick for selections > 100 (v1 caps per click instead).
- Multiple found emails per profile.
- Select-all-across-DB (Gmail-style banner).
- Re-finding emails we already have.

## Testing

- Pure unit: extended `profileEmailInfo()` (found-email → Unverified path).
- Pure unit: eligibility filter (claimed / already-found excluded).
- Pure unit: charge accounting (count of `valid` hits → cents, super-admin bypass).
- Route test: AnyMailFinder client mocked; assert store + debit only on `valid`,
  no debit for super-admin, no store/charge on non-valid.
- Cursor pagination: keyset returns the correct next page and terminates.

## Open items to confirm during implementation

- Exact AnyMailFinder auth header (`Authorization: Bearer <key>` assumed; verify).
- Whether `risky` should ever be stored (default: no — `valid` only).
