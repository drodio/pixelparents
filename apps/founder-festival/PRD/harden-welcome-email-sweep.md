## Progress Update as of 2026-05-28 01:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Investigated a report that profile-claim welcome emails weren't going out. Found
the email system is actually healthy and delivering; the apparent "stop" was just
an absence of new claims. Hardened the one real latent reliability bug in the
sweep so a single bad recipient can no longer wedge the whole queue.

### Detail of changes made:
- **Diagnosis (no active bug):** `vercel.json` cron `/api/cron/lifecycle-emails`
  runs every 2 min → `runClaimWelcomePass`/`runDevApiWelcomePass` in
  `src/lib/welcome-email-sweep.ts`. As of 2026-05-28, 22 profiles claimed, 20
  marked in `sent_emails`, delivery confirmed by the operator's inbox (CC to
  founder@festival.so). The 2 unsent rows are stale duplicate "Daniel R. Odio"
  Clerk accounts with no Clerk info → correctly skipped (`if (!info) continue`).
  Jordan Lee WAS sent (8:28 PM PT May 27). Alex Kim is NOT in `users` —
  they have an `evaluations` row (profile page) but never completed a claim, so no
  email was ever queued. "Last email at 6:54 AM" = Sam Rivera was the most recent
  claim; there have simply been no new claims since. Cron scheduler liveness
  confirmed via `app_stats`/`score_items` (scoring-tick runs every minute).
- **Fix (`src/lib/welcome-email-sweep.ts`):** wrapped each recipient's
  send+markSent in a per-user try/catch in BOTH passes. Previously
  `sendRawEmail` throwing on a Resend error aborted the entire pass, leaving
  everyone later in `verifiedAt`/`createdAt` order stuck behind one bad address
  indefinitely. Now a failure is logged and the row left unmarked (retries next
  run) while the rest of the batch proceeds. Added a `failed` count to both
  passes' return shape + a per-run summary `console.log` for observability.
- **Test (`tests/lib/welcome-email-sweep.test.ts`, new):** mocks `@/db`, Clerk,
  and the senders to prove (a) a thrown send for u1 still sends + marks u2 with
  `{sent:1, skipped:0, failed:1}` and u1 left unmarked, and (b) the happy path
  marks everyone with `failed:0`.
- Verified: `tsc --noEmit` clean, eslint clean, vitest green.

### Potential concerns to address:
- **Silent skip is still silent.** OAuth claimers with no Clerk email hit the
  skip path → marked sent WITHOUT an email and with no recorded reason.
  `sent_emails` stores no recipient/Resend id, so a skip vs a real send is
  indistinguishable after the fact. Consider storing the recipient + Resend
  message id (and/or a `reason`) per row for auditability.
- **Concurrent development observed.** During this session the repo HEAD advanced
  (89232cb → edc0c5f) and `welcome-email-sweep.ts` gained `nickname` support from
  another source. This branch is based on the latest; rebase/pull before merge.
- A failing recipient now retries every run forever (harmless, but noisy). If a
  hard-bounce address persists, consider a max-retry / dead-letter mark.
