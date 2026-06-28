# Progress — worktree-bug-fixes-3001

## Progress Update as of 2026-06-22 9:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` to land PR #423 (email @mention gold). globals.css auto-merged cleanly (my `.mention-suggestion-active` rule intact); only PRD conflicted — took the branch copy (its own progress log).

## Progress Update as of 2026-06-22 9:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made @mention gold consistent in the EMAIL composer too (the rich-text body / VariablePillInput from #419), matching the chat. Now gold everywhere mentions appear.

### Detail of changes made:
- `src/components/admin/email/VariablePillInput.tsx`: `buildSuggestion` now sets `decorationClass: "mention-suggestion-active"` (reuses the globals.css rule) so the in-progress "@query" turns gold while typing; the dropdown member name renders gold (`text-[#dfa43a]`). Picked members were already gold via the editor's `[&_a]:text-[#dfa43a]`.
- Consistency sweep confirmed the rest is already gold: chat/captions/endorsements composers (MentionChipInput → rich-text-mention.tsx, prior commit), and rendered display (MentionText `text-[#dfa43a]`, `.mention` anchors).
- Note: plain unpicked "@JONAH" text stays default — it's not a real mention (not picked), consistent with the chat. tsc + eslint clean.

## Progress Update as of 2026-06-22 8:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (PRs #418/#419 etc.) into the branch to land PR #421. Only PRD conflicted — resolved by taking the branch copy (it's this branch's own progress log; main held an older snapshot). Code files (event-chat.ts, rich-text-mention.tsx, globals.css) merged cleanly despite #419 also touching @member rich text.

## Progress Update as of 2026-06-22 8:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cleared roborev #135 (thread-cleanup review). Made the read-path orphan delete race-safe and added coverage; declined #138's truncation nit.

### Detail of changes made:
- `listVisibleThreads`: the orphan-tombstone DELETE now re-checks title+body="[deleted]" AND `NOT EXISTS` any comment, atomically in the WHERE — so a reply added in the SELECT→DELETE window can't be cascade-lost (fixes #135 finding 2; narrows finding 1).
- Declined #135 finding 1's schema-column suggestion: the "[deleted]" sentinel is the established convention (deleteThread/ThreadRoot/ChatReplyTree), such a user thread already renders as a tombstone, and a deletedAt/status column is a larger schema+migration change out of scope here.
- Added tests: deleting the last reply of a LIVE thread keeps it; a tombstone WITH a surviving reply stays visible + in DB. (4 tests total, all green on Neon test branch.)
- #138: declined the dropdown-truncation nit — wrapper keeps `min-w-0 flex-1 truncate`; nested inline label/company spans truncate within it exactly as the prior single span did.

## Progress Update as of 2026-06-22 8:42 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
@mention now turns gold as you type AND in the dropdown match. Two changes to the shared TipTap mention input (`src/components/admin/rich-text-mention.tsx` + globals.css), so it applies everywhere MentionChipInput is used (chat thread + reply + edit, captions, endorsements).

### Detail of changes made:
- `mentionSuggestion.decorationClass = "mention-suggestion-active"` + new `.mention-suggestion-active { color:#dfa43a; font-weight:500 }` in globals.css → the in-progress "@query" text turns gold while typing (TipTap's suggestion plugin wraps the active token in that decoration span), matching the gold picked-chips (`.mention`).
- `MentionList` dropdown: the candidate name (`it.label`) now renders gold (`text-[#dfa43a]`); company stays zinc-500. So the matching name(s) show gold too.
- Note: `src/components/events/chat/MentionInput.tsx` is dead code (no imports; chat uses MentionChipInput) — left untouched. Candidate for later deletion.
- tsc + eslint clean. No automated test: TipTap/React visual styling, and the repo has no component-test harness.

## Progress Update as of 2026-06-22 8:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event chat: a deleted thread that has no chats and no replies is now removed entirely instead of lingering as an empty "[deleted]" row. Root cause: `deleteThread` correctly hard-deletes a 0-reply thread but tombstones one with replies; if those replies were later deleted, `deleteComment` left an orphaned tombstone. (TDD: red→green against the Neon test branch.)

### Detail of changes made:
- `src/lib/event-chat.ts`: `deleteComment` now captures the comment's `threadId` and, after hard-deleting the last reply, calls new `removeIfEmptyTombstone()` to hard-delete the thread when it's a "[deleted]" tombstone with no comments left. `listVisibleThreads` now excludes orphaned tombstones (title+body "[deleted]", 0 replies) AND hard-deletes them on read, so pre-existing orphans (like the one on /events/9nj5he2k) disappear through normal traffic — app-driven, not an out-of-band prod write.
- Test: `tests/app/event-chat-tombstone-cleanup.test.ts` — last-reply-deletion removes the tombstone; listVisibleThreads hides+cleans a pre-existing empty tombstone. tsc clean.

## Progress Update as of 2026-06-22 1:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` into the branch to ship PR #412 (the earlier #411 squash had landed older copies of the guard/script files on main, causing add/add + content conflicts). Resolved both conflicts (`scripts/guards/vercel-prod-guard.sh`, this PRD) by taking the branch versions — the strictly newer, reviewed copies (host-match + `local` + case-insensitive guard; full PRD history). Re-verified the guard blocks `--prod` / passes preview post-merge.

## Progress Update as of 2026-06-22 1:44 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cleared roborev #100 (review of the #88/#98 fix commit): lowercased the extracted host in the vercel prod-guard so case variants (`Festival.SO`, `WWW.FESTIVAL.SO`) can't slip past (DNS is case-insensitive). Declined finding 2 (host extraction not matching `--meta url=festival.so` — the intended #88 trade-off; reviewer verdict "None required"). Verified block/pass in bash + zsh.

### Potential concerns to address (SECURITY — do soon):
- **Prod Clerk secret key was printed in cleartext** earlier this session — ROTATE `CLERK_SECRET_KEY` (`sk_live_…`), update Vercel Production env + `.env.prod.local`.
- Vercel prod-deploy lock still preventive-only pending the user's plan decision (Pro, no 2nd seat).

## Progress Update as of 2026-06-22 1:38 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cleared roborev push-gate (reviews #88, #89, #98) — fixed the 3 valid findings, declined the rest with recorded reasons.

### Detail of changes made:
- #88 vercel guard (VALID x2): (a) domain match now extracts the HOST from each arg (strip scheme/path/userinfo/port) and matches prod domains as exact-or-subdomain, not bare substring — kills false positives like `staging.festival.so.internal` / `my-festival.so-test` while still blocking `alias … festival.so` and `redeploy https://…festival.so`; (b) helpers now `local` (no interactive-shell leakage, interrupt-safe, dropped manual `unset`). Declined the "$1-only subcommand" nit (promote/rollback are always $1).
- #98 claim page (VALID x1): catch now also treats `code === "authorization_invalid"` (the actual server-side single-session code from the bug) as a signed-in signal, not just `session_exists`/"already signed in". Declined the `window.location.href` vs `router.push` nit (full reload to reset Clerk client state is intentional, mirrors the modal).
- #89 connections script: both findings declined (unknown-flag validation = YAGNI on a manual tool; gate-placement = reviewer's own "None required").
- Re-verified guard block/pass + no-leak in bash AND zsh; tsc + eslint clean.

### Potential concerns to address (SECURITY — do soon):
- **Prod Clerk secret key was printed in cleartext** earlier this session (masking cmd failed on the quoted value). ROTATE `CLERK_SECRET_KEY` (`sk_live_…`) in Clerk → update Vercel Production env + `.env.prod.local`.
- Vercel prod-deploy lock still preventive-only pending the user's plan decision (Pro, no 2nd seat).

## Progress Update as of 2026-06-22 1:24 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a live prod sign-in bug: signed-in users hitting the standalone `/claim` page and clicking LinkedIn/GitHub got a raw `authorization_invalid` JSON error page on clerk.festival.so. Root cause was NOT LinkedIn/Clerk config — `/claim/page.tsx` called `authenticateWithRedirect` with no already-signed-in guard, which Clerk (single-session) rejects server-side. `ClaimProfileModal.tsx` already had the fix; the standalone page didn't.

### Detail of changes made:
- `src/app/(authed)/claim/page.tsx`: mirrored the modal's guard in `go()` — pre-flight `isSignedIn` → redirect straight to `/claim/callback?e=…&return=welcome` (or `/welcome` when no eval); preventive `clerk.signOut()` to clear half-complete OAuth state cookies (same error class); try/catch on `authenticateWithRedirect` that falls through to the callback on `session_exists`/"already signed in". Added `useUser`/`useClerk` imports.
- Diagnosis was provider-agnostic: GitHub and LinkedIn share the exact code path, so a LinkedIn-only failure ruled in "already signed in," not provider config.
- tsc + eslint clean. No tests added: repo has 188 vitest tests but ZERO React-component tests (no @testing-library/react, no .test.tsx) — convention is logic/route tests only; mirrored an existing proven (also untested) pattern rather than stand up an RTL harness for a redirect guard.

### Potential concerns to address (SECURITY — do soon):
- **Prod Clerk secret key was printed in cleartext** in a troubleshooting session (a masking command failed on the quoted value). `CLERK_SECRET_KEY` (`sk_live_…`) should be ROTATED in the Clerk dashboard, then updated in Vercel (Production env) + local `.env.prod.local`. Publishable key is public — no action.
- Vercel prod-deploy lock is still preventive-only (shell guard + token hygiene) pending the user's plan decision (Pro, no 2nd seat).

## Progress Update as of 2026-06-22 1:02 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cleared roborev review #78 (3 Low findings on `scripts/generate-connections-for-attendee.cjs`, all judged VALID and fixed in this follow-up commit).

### Detail of changes made:
- Finding 1 (duplicated Chief submit): extracted `chiefSubmit(prompt)` + shared `CHIEF_HEADERS`; both `chief()` and the `--async` path now call it (single source of the submit contract).
- Finding 2 (silent prod write): added an `FF_ALLOW_PROD_WRITE=1` opt-in gate — the script refuses to run without it, so an agent can't out-of-band mutate prod (aligns with AGENTS.md + today's vercel guard work).
- Finding 3 (usage/flag collision): flags are now position-independent (`ASYNC = ARGS.includes("--async")`, positional args filtered with `!a.startsWith("--")`), so `… <eventId> --async` no longer sets `NAME="--async"`; usage string documents `[--async]`.
- Verified: `node --check` passes; prod-write guard fires without opt-in; usage fires on flag-only invocation.

### Potential concerns to address:
- None new. The `FF_ALLOW_PROD_WRITE` gate makes the script slightly less convenient (intended). Sync path is now also gated (it shares the same top-of-file guard).

## Progress Update as of 2026-06-22 12:49 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a local guardrail that hard-blocks manual `vercel` production deploys from any worktree, complementing (not replacing) the real Vercel-side lock. Discussed the RBAC reality with the user: on a solo team they're the Owner, and Vercel cannot restrict an Owner's own token — the real fix is a non-Owner deploy identity (Contributor role on Pro / drop `FullProductionDeployment` permission on Enterprise) or token hygiene on Hobby. This commit is the belt-and-suspenders piece.

### Detail of changes made:
- NEW `scripts/guards/vercel-prod-guard.sh`: defines a `vercel()` shell-function wrapper. A git hook can't catch this — `vercel --prod` never touches git — so interception happens at the `vercel` command. Blocks `--prod`/`--production`, `--target production|=production`, `promote`, `rollback`, and any arg referencing a prod domain (`$FF_PROD_DOMAINS`, default `festival.so www.festival.so`) e.g. `alias set … festival.so`, `redeploy …festival.so`. Everything else (preview `deploy`, `env pull`, `ls`, `whoami`, `--target preview`) passes through to the real binary via `command vercel`.
- Portable POSIX token-peel for the domain list (zsh does NOT word-split an unquoted scalar like bash does — a plain `for x in $VAR` silently iterated zero domains; fixed). Verified: 10 prod forms blocked + 5 safe forms pass, identical in bash AND zsh.
- NEW `scripts/guards/README.md`: install steps + human escape hatch (`command vercel …` bypasses the function intentionally).
- Machine-local (NOT in repo): installed active copy to `~/.config/founder-festival/vercel-prod-guard.sh` and appended a source line to `~/.zshrc`. The rc sources the installed copy, so re-copy on change.

### Potential concerns to address:
- This is a guardrail, not a security boundary: `command vercel --prod` or the absolute binary path bypasses it. The durable lock still depends on the user making the Vercel-settings/token change (their call, plan-dependent).
- Repo copy and the `~/.config` copy can drift; README notes to re-copy. Could later have `.zshrc` prefer the repo copy, but that reintroduces a worktree-path dependency.

## Progress Update as of 2026-06-19 7:43 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
ROOT-CAUSE FIX (beads `ff-23f`): in-app Chief insight generation was timing out. The route ran Chief synchronously with maxDuration 300s, but Chief *research* takes >5min (Daniel 374s), so the function was killed before storing — nothing persisted, "Generating…" was ephemeral client state (why Erika showed "not generated yet"). Reworked to **async submit + cron poll + persistent status**, for BOTH personalized learnings and attendee insights.

### Detail of changes made:
- src/lib/chief.ts: new `chiefSubmit()` (fast POST → {chatId,messageId}) + `chiefPoll()` (one non-blocking GET → pending|ready|error). chiefSearch unchanged for the eval tool / local scripts.
- Schema (migration 0063, applied dev+prod via scripts/apply-insight-status-migration.ts): both insight tables gain `status` (default 'done'), `chief_chat_id`, `chief_message_id`, `error`. html stays NOT NULL ('' while generating). NB: dev never had event_personalized_learnings — the apply script CREATE-IF-NOT-EXISTS both tables.
- Stores: submit*Generating (status='generating', html=''), listGenerating*, mark*Done/mark*Failed; getters now carry status/error; **viewer getters only return status='done'** (event page won't show in-progress); event getters return all (admin rows show live status).
- Routes: connections route is now async (chiefSubmit + submitConnectionsGenerating, maxDuration 30). personalized route gains `{async:true}` (attendee rows/bulk) → submit; without it (the AI-vs-Chief eval tool) stays synchronous.
- NEW cron `/api/cron/chief-insights-sweep` (every min, src/lib/chief-insights-sweep.ts): polls in-flight rows, stores answers (sanitized) as 'done', fails rows stale >15min. Registered in vercel.json.
- NEW GET /api/admin/events/[id]/insights-status (status-only) for polling.
- AttendeeManager: InsightAccordion is status-aware (Generating spinner + elapsed / Generated+Re-generate / Failed+Retry / Generate). Insights now derived from server props + small optimistic overrides (props win) — avoids the react-hooks/set-state-in-effect lint; a 6s poll runs while anything is generating and router.refresh()es on settle. ChiefInsightsPanel submits async (fast) + refreshes; bulk skips done/generating but RETRIES failed.
- Removed now-dead generateConnectionsChief. tsc+eslint+tests (chief, recommended-connections) green.
- roborev #69: (1) Re-generate of a "done" row never reflected completion (stale 'done' prop masked the optimistic 'generating' → poll never started). Fixed with a generatedAt-aware mergeInsights(): an optimistic 'generating' wins until the server has a strictly-newer entry. (2) submit*Generating no longer wipes prior html — the conflict-update preserves it, and viewer getters now show the last good answer (html != ''), so a failed regeneration doesn't destroy a published insight.
- roborev #72: hardened mergeInsights — NaN-safe (unparseable/absent prop timestamp treated as older → optimistic wins) and server-wins-on-tie (`!(propTime >= optTime)`). Declined the "failed row still serves preserved html to viewers" finding: that's the intended last-good-answer behavior (a previously-published answer beats blanking the public page on a transient background failure; admin sees 'failed' + Retry).

### Verified live (2026-06-19 ~8:00 PM PT):
- End-to-end on PROD: submitted Erika Anderson's connections async (scripts/generate-connections-for-attendee.cjs --async stores a 'generating' row with the Chief chat ids), the SCHEDULED chief-insights-sweep cron polled + stored it 'done' (6086 chars) ~7min later. Confirms: deployed cron runs on schedule, prod CHIEF_API_TOKEN is valid, chiefPoll+sanitize+markDone work. (Could not curl the cron manually — pulled .env.prod.local CRON_SECRET is redacted/empty, 403; the scheduled run is what matters.)

## Progress Update as of 2026-06-19 7:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Per-attendee **Re-score** button on the event admin Attendees rows (beads `ff-sth`) — re-score one person at a time alongside the existing "Re-Score All". Also: confirmed Daniel R. Odio's Attendee Insights generated + stored to prod (5481 chars) via the fresh Chief token found in the event-followups worktree.

### Detail of changes made:
- src/app/api/admin/events/[id]/rescore-attendees/route.ts: now accepts optional `{ evaluationId }` — narrows getRescoreableAttendeeProfiles to that one eval (400 `not_rescoreable` if it's unmatched/removed/source=code), single-attendee job title. Same credit-hold + queued-job path as the bulk run.
- src/components/admin/AttendeeManager.tsx: amber "Re-score" button per matched row (gated by canRescore), `rescoreOne(evalId,name)` with confirm + insufficient-credits/not-rescoreable messaging, seeds the per-row status chip via refreshStatuses() (the existing 4s poller drives queued→scoring→complete).
- tsc + eslint clean. No migration.

## Progress Update as of 2026-06-19 6:13 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added **Recommended Connections** ("Attendee Insights") — a second Chief-generated insight per attendee, mirroring personalized learnings end-to-end (beads `ff-kh7`). New "Run Chief to generate insights" admin section with two bulk buttons; each attendee row now has two sub-accordions ("Personalized Learnings" + "Attendee Insights"); attendee event-page box; `{{recommended-connections}}` email variable. NOTE: the manual run for Daniel R. Odio is BLOCKED — the local CHIEF_API_TOKEN is expired (Chief returns `publicapi.auth.token.invalid`; the X-API-Key header style is confirmed correct).

### Detail of changes made:
- DB: new `event_recommended_connections` table (migration 0061; applied to DEV + PROD via scripts/apply-recommended-connections-migration.ts). Sibling of event_personalized_learnings, unique (event_id, evaluation_id).
- src/lib/recommended-connections.ts: `buildConnectionsPrompt` (exact spec — top-3 connections + give/get, full attendee roster w/ festival profile URLs, HTML output instruction), `generateConnectionsChief` (Chief research), `siteBaseUrl()`. src/lib/recommended-connections-store.ts: store + viewer/event getters (deploy-safe try/catch).
- API: POST /api/admin/events/[id]/connections {evalId} — builds prompt from event learnings + listEventAttendeesAdmin roster, runs Chief, stores.
- Admin UI: ChiefInsightsPanel (bulk, two buttons, router.refresh after). AttendeeManager: removed the old single bulk button; rows now render two InsightAccordion sub-sections (Personalized Learnings, Attendee Insights), each with per-row generate/re-generate. Page loads getStoredConnectionsForEvent + wires initialConnections + connectionsHtmlByEval.
- Attendee event page: RecommendedConnections box (sky theme), same viewer gating as PersonalizedLearnings.
- Email: `recommended-connections` variable ("Attendee insights") in email-variables catalog + buildRecipientValues; threaded connectionsHtml through email-render.renderForRecipient, event-email-send (send + preview), EmailComposer + EmailsTextsPanel live preview.
- scripts/generate-connections-for-attendee.cjs: self-contained single-attendee manual run (prod DB + Chief). CHIEF_PROJECT_ID added to .env.local (was missing).
- tsc + eslint clean; email-variables/template-doc/event-email-send tests pass.
- roborev #60 triage: FIXED malformed profile-URL fallback (now profileUrlFor, not `/${slug}`) + added tests/lib/recommended-connections.test.ts (buildConnectionsPrompt roster/empty branches). Declined admin re-sanitize (mirrors personalized; route sanitizes; .cjs operator-only) + .cjs duplication (intentional one-off).
- roborev #61 triage: declined profileUrlFor-signature concern (verified `{evalId,slug?,slugKind?,clerkUsername?}`, comment accurate); hardened the test with a subject-self-exclusion assertion.

### Potential concerns to address:
- **Expired Chief token**: if PROD's Vercel CHIEF_API_TOKEN is also expired, the in-app Generate buttons won't work in prod either. Needs a fresh token to verify + to run Daniel's sample.
- Each /connections call re-runs listEventAttendeesAdmin (incl. its unmatched-name search fan-out) — negligible vs Chief's minutes, but could be slimmed to a matched-only roster query later.

## Progress Update as of 2026-06-18 9:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event email composer now includes matched attendees whose Luma row has no stored email (hosts, some registrations) — previously they were silently dropped, so e.g. the host couldn't email themselves. Confirmed on prod: Daniel R. Odio is a matched attendee of event 6e515b68 with stored email = NULL (clerk=yes, profile_email=drodio@chief.bot). It was NOT a "logged-in-as-self" exclusion — there is no viewer filter; the recipient pool is just `attendees.filter(a => !!a.email)`.

### Detail of changes made:
- src/lib/event-attendees-admin.ts: new `resolveAttendeeProfileEmails(evalIds)` — for matched attendees, resolves the claimer's Clerk login email (primary, high-confidence claim) then best `profile_emails` row (verified→unverified). Defensive `db.execute` rows normalization (array | {rows}), like loadClaimedProfiles.
- src/app/(authed)/admin/events/[id]/page.tsx: emailRecipients now falls back to the resolved profile email when `eventAttendees.email` is null; filter moved after the map so resolved rows survive.
- scripts/diagnose-attendee-email.ts: read-only prod diagnostic (reads .env.prod.local at repo root via readFileSync, DATABASE_URL_UNPOOLED first).

## Progress Update as of 2026-06-16 2:57 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed event link previews (WhatsApp/social) showing raw HTML. The event-page `generateMetadata` was emitting `event.description` (stored as HTML) verbatim as the OG `description`, so previews showed `<p><strong>Agenda…`. Now stripped to plain text and capped at ~200 chars.

### Detail of changes made:
- src/lib/markdown.ts: new `htmlToText(html)` — strips tags (block closers → space), decodes common entities, collapses whitespace. Client-safe/isomorphic.
- src/app/(authed)/events/[slug]/page.tsx: generateMetadata now `htmlToText(event.description)`, truncated to 200 chars with an ellipsis. tsc clean; the only eslint error (line ~178 `<a href="/">`) is pre-existing/unrelated.

## Progress Update as of 2026-06-12 3:40 PM Pacific
*(Committed locally; PUSH HELD on the events.location prod migration.)*

### Summary of changes since last update
Event location ("• San Mateo, CA" after the date). New events.location column (migration 0059, dev-applied). Luma sync fills "City, ST" from geo_address_json.city/region when present (preserve-on-resync so it never wipes an admin value); admin EventDateEditor gets a Location text field (autosaves via the date route); the event-page date line shows it.

### Detail of changes made:
- schema.ts events.location text; drizzle/0059_rare_wither.sql (ADD COLUMN).
- src/lib/luma.ts: geo_address_json gains city/region/country. src/lib/luma-sync.ts: locationOf(ev); set on insert; preserve-on-empty on reimport + onConflictDoUpdate.
- src/components/admin/EventDateEditor.tsx: Location input + persist() sends {startsAt,endsAt,location}. api/admin/events/[id]/date: accepts location (only writes when provided). admin event page passes initialLocation; public EventDate passes location={event.location}.
- scripts/apply-event-location-migration.ts. tsc + eslint clean.

### Blocker:
- PUSH HELD until prod has events.location (the schema change makes event queries select it). Run: `npx tsx scripts/apply-event-location-migration.ts --target=prod`, then I push.

## Progress Update as of 2026-06-12 3:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Upcoming-event polish (no migration): (1) "Add your photos" (AttendeePhotoUpload) only renders on PAST events now. (2) AttendeesTable's unclaimed prompt is tense-aware — "Are you attending this event?" (upcoming) vs "Did you attend this event?" (past) via a new `upcoming` prop. (3) Event date reformatted to "Thursday, July 2 4PM-8PM PT" — weekday + month/day + compact start–end time range in Pacific (drops :00 and the AM/PM space). Location (" • City, ST") is next — needs a new events.location column (prod migration).

### Detail of changes made:
- src/app/(authed)/events/[slug]/page.tsx: AttendeePhotoUpload gated on isPastEvent(event); EventDate rewritten for the range format + optional location; AttendeesTable gets upcoming={!isPastEvent(event)}.
- src/components/events/AttendeesTable.tsx: `upcoming` prop → tense-aware prompt.
- tsc clean; only the pre-existing header-logo <a> lint.

### Next (migration-gated): events.location
- Add events.location text column; Luma sync fills "City, ST" from geo_address_json (city + region/state) when available; admin EventDateEditor gets a Location input; EventDate shows " • <location>". Build + commit, then run prod migration before push (like hosts.slug).

## Progress Update as of 2026-06-12 2:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Upcoming event pages now render the FULL past-event structure (chat, attendees, analytics/spider-graphs, hosts, sponsors, description). Removed the separate upcoming branch (description + Apply + Hosts/Sponsors) and made the body always render <Recap event={event} /> for both past and upcoming; recap-only sections (photo carousel, post-event learnings) self-hide when empty, so upcoming events just don't show those. The only upcoming-specific bit kept is the "Apply to attend" CTA (above the Recap); the header still shows date for upcoming and the recap nav/pill for past.

### Detail of changes made:
- src/app/(authed)/events/[slug]/page.tsx: replaced `{past ? <Recap/> : <upcoming branch>}` with `{!past && <Apply CTA/>}` + always `<Recap event={event} />`. HostsSection/SponsorsSection now only render inside Recap (still used). tsc clean.

## Progress Update as of 2026-06-12 2:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event-page host & sponsor cards refined: (1) "[Name]: [About]" now renders inline — bold name + colon + description on the same line (aboutWithName() prepends **Name:** into the Markdown). (2) The description is clamped to the image height with a fade + "… Read more" toggle that expands the card (NEW ClampedHtml client component). Images are fixed boxes so the clamp is deterministic: host h-[200px] w-[200px] (clamp 200), sponsor h-20 w-32 (clamp 80). Applied identically to hosts and sponsors.

### Detail of changes made:
- NEW src/components/events/ClampedHtml.tsx: renders sanitized HTML capped at maxHeight px; shows fade + "… Read more"/"Show less" when it overflows (measures scrollHeight).
- src/app/(authed)/events/[slug]/page.tsx: HostsSection + SponsorsSection col2 now <ClampedHtml html={markdownToHtml(aboutWithName(name, blurb))} maxHeight=200|80 />; host image changed h-auto→h-[200px] (square box). CARD_PROSE gains [&_strong] styling (bold name brighter).
- tsc clean; only the pre-existing header-logo <a> lint.

## Progress Update as of 2026-06-12 2:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event-page "Hosted by" cards now match the Sponsor two-column layout: logo in column 1 (kept at w-[200px] per the earlier larger-host-logos PR), name + About (Markdown) in column 2 (name links separately from the About so Markdown links don't nest <a>). "Everything for sponsors matches hosts" now.

### Detail of changes made:
- src/app/(authed)/events/[slug]/page.tsx HostsSection: same two-column card structure as SponsorsSection (logo col1 / name+About col2). tsc clean.

## Progress Update as of 2026-06-12 2:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(1) Event pills on the /hosts + /sponsors index cards (and EventLinkPills on profile pages) were overflowing the card with long titles — now `block max-w-full truncate` + title tooltip so each pill caps at the card width and ends with "…". (2) Event-page Sponsor cards restructured to two columns: logo in column 1 (3× wider, h-20 w-32, was h-10 w-10), name + About (Markdown) in column 2. Logo links to /sponsors/<slug> and the name links separately so the About's Markdown links don't nest <a>.

### Detail of changes made:
- src/app/(authed)/hosts/page.tsx, sponsors/page.tsx, src/components/events/EventLinkPills.tsx: pill className whitespace-nowrap → block max-w-full truncate + title={e.title}.
- src/app/(authed)/events/[slug]/page.tsx SponsorsSection: two-column card (logo col1 / name+About col2); image h-20 w-32 object-contain.
- tsc clean; only the pre-existing header-logo <a> lint.

## Progress Update as of 2026-06-12 1:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Prod hosts.slug column applied (user ran the migration). Rebased the held batch onto origin/main, which had diverged with related host work (#376 larger host logos, #377 'Edit event' pill, badge rounding). Resolved the one conflict (event-page imports — kept upstream's can/canAccessEvent/AdminProfileBox + my hostSlug) and verified the merge preserved BOTH upstream's larger logos (event 'Hosted by' w-[200px], host page w-4/5) AND my Markdown blurbs. Moved the event-page CARD_PROSE const below the imports. tsc clean. Pushing now.

## Progress Update as of 2026-06-12 1:10 PM Pacific
*(Still committed locally, PUSH STILL HELD on the hosts.slug prod migration.)*

### Summary of changes since last update
Host/sponsor "About" (was "Blurb") now supports Markdown, plus a wider image preview in the admin editor. Added `marked` dependency.

### Detail of changes made:
- NEW src/lib/markdown.ts: markdownToHtml (marked + breaks:true, reuses sanitizeRecapHtml) + markdownToText (strip for summaries). Isomorphic.
- NEW src/components/admin/MarkdownField.tsx: Write/Preview toggle, stores raw Markdown, preview renders like the public pages.
- HostEditor + SponsorEditor: "Blurb" label → "About", textarea → MarkdownField; IconPicker previewClass="h-16 w-48" (~3x wider image; the dashed upload box auto-shrinks via flex-1).
- IconPicker: new previewClass prop (default "h-16 w-16").
- Public rendering now markdown: host/sponsor profile pages (PROSE div), event-page host/sponsor cards (CARD_PROSE; About moved OUTSIDE the card's profile link so Markdown links don't nest <a>). Index-card summaries use markdownToText then first-20-words.
- package.json/pnpm-lock: + marked.
- tsc clean; eslint only the pre-existing event-page header-logo <a>. Smoke-tested markdownToHtml/Text.

### Reminder (unchanged blocker):
- PUSH STILL HELD until prod gets hosts.slug. Run: `npx tsx scripts/apply-host-slug-migration.ts --target=prod`, then I push the whole batch.

## Progress Update as of 2026-06-12 12:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Host/sponsor surface buildout (committed locally, PUSH HELD — see concern): (1) editable host slug; (2) blurb paragraph breaks now render; (3) event-title hover-pencil editor; (4) /hosts + /sponsors index pages with cards; (5) "Events hosted/sponsored" on the host/sponsor profile pages.

### Detail of changes made:
- HOST SLUG: schema.ts hosts.slug (nullable; migration drizzle/0056_moaning_sage.sql = ADD COLUMN); applied to DEV only (prod pending). hosts.ts: hostSlug()/getHostBySlug()/isHostSlugTaken(); createHost/updateHost accept slug (default slugify(name)). HostEditor: live-slugified "URL slug" field + festival.so/hosts/<slug> hint + error surfacing. api/admin/hosts/[id] PATCH: normalize+uniqueness(409). /hosts/[slug] resolves via getHostBySlug; event host card links use hostSlug.
- BLURB: whitespace-pre-line on host/sponsor cards (event page) + host/sponsor profile blurbs.
- EVENT TITLE: NEW src/components/admin/EventTitleEditor.tsx (group-hover pencil → inline input, Enter save/Esc cancel) + api/admin/events/[id]/title POST; admin event page <h1> replaced.
- INDEX PAGES: NEW /hosts/page.tsx + /sponsors/page.tsx (cards: picture + ~20-word blurb summary + "…" + past-event pills; card body → profile, pills → /events/<slug>). New getEventsForHost/getEventsForSponsor + sponsorSlug + NEW EventLinkPills component. Profile pages got an "Events hosted/sponsored" section.
- scripts/apply-host-slug-migration.ts: applies the column to a target DB.
- tsc + eslint clean (pre-existing _o warning in hosts/sponsors only).

### Potential concerns to address:
- PUSH HELD: adding hosts.slug to the Drizzle schema makes EVERY hosts query SELECT slug, so deploying before prod has the column breaks host queries app-wide (public event pages with hosts, /admin/hosts, /hosts pages). MUST apply the prod migration FIRST: `npx tsx scripts/apply-host-slug-migration.ts --target=prod` (additive ADD COLUMN IF NOT EXISTS). The auto-mode classifier blocked me running it (standing prod-DB rule); awaiting the user to run it (or authorize), THEN push.
- Sponsors still have NO slug column (URLs are name-derived); fine for now. If host/sponsor URLs must be stable+shareable, give sponsors a slug column too.

## Progress Update as of 2026-06-12 11:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Dedicated pages for each host and sponsor: /hosts/<slug> and /sponsors/<slug> (e.g. /hosts/zero-zero-guild). Big centered logo/icon at top, then name, blurb, "Visit website" link, and the host/sponsor's people (ProfileMiniTable). Host/sponsor cards on the event page now link to these pages (instead of the external URL — that moved to the dedicated page).

### Detail of changes made:
- NEW src/app/(authed)/hosts/[slug]/page.tsx + src/app/(authed)/sponsors/[slug]/page.tsx: resolve by slugify(name) over listHosts()/listSponsors() (no slug column exists; first match wins on name collision); notFound() if no match. Standard header (logo via Link + SiteHeaderNav currentPage=events eventsAsLink). Public (under (authed), signed-out OK).
- src/app/(authed)/events/[slug]/page.tsx: HostsSection/SponsorsSection cards now link to /hosts/${slugify(name)} and /sponsors/${slugify(name)}; added slugify import.
- tsc + eslint clean on new files (event page only has the pre-existing logo <a> warning).

### Potential concerns to address:
- Slugs are name-derived (no stored slug). Renaming a host/sponsor changes its URL; identical names collide (first wins). If these pages need stable/shareable URLs, add a slug column + backfill later.

## Progress Update as of 2026-06-12 11:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Sponsors now also show on upcoming events (same as hosts). Extracted the inline Recap "Sponsors" block into a reusable async SponsorsSection({eventId, isClaimed}); rendered in both the upcoming branch and the recap. (Dedicated host/sponsor pages are next.)

### Detail of changes made:
- src/app/(authed)/events/[slug]/page.tsx: NEW SponsorsSection (getSponsorsForEvent + getSponsorPeopleRows, null when none); removed Recap's inline sponsors block + its redundant fetch/sponsorsWithPeople; upcoming branch renders HostsSection + SponsorsSection.
- tsc clean.

## Progress Update as of 2026-06-12 11:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event detail page (/events/[slug]): the "Hosted by" host cards (icon + name + blurb + their people mini-table) now show on UPCOMING events too, not just past-event recaps. Extracted the inline hosts markup from Recap into a reusable async HostsSection({eventId, isClaimed}) and rendered it in both the upcoming branch (after "Apply to attend") and the recap.

### Detail of changes made:
- src/app/(authed)/events/[slug]/page.tsx: NEW HostsSection async component (loads getHostsForEvent + getHostPeopleRows, returns null when no hosts). Recap's inline hosts block + its redundant getHostsForEvent fetch/hostsWithPeople removed in favor of <HostsSection .../>. Upcoming branch renders <HostsSection eventId isClaimed={!!viewer.ownEvaluationId} /> (note: upcoming-page viewer uses ownEvaluationId; Recap's getViewerAttendeeContext viewer uses evaluationId).
- tsc clean; eslint only the pre-existing header-logo <a>.

## Progress Update as of 2026-06-12 10:55 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Personalized event learnings: removed the "Generate my personalized learnings" on-demand button. The "Personalized Learnings for <name>" box now renders ONLY when learnings have already been generated on the backend (admin run, stored via storePersonalizedLearning) for the viewer. Also reworded the intro from "Get learnings from this event tailored to you — drawn from your Festival profile and everything shared here." → "These event learnings are tailored to you — drawn from your Festival profile and everything shared at this event."

### Detail of changes made:
- src/lib/personalized-store.ts: NEW getStoredPersonalizedForViewer(eventId, evaluationId) → StoredPersonalized | null.
- src/app/(authed)/events/[slug]/page.tsx: looks up the viewer's stored learnings (sanitizeRecapHtml'd) into `personalLearnings`; renders the box only when !unclaimed && personalFirstName && personalLearnings; passes html instead of slug.
- src/components/events/PersonalizedLearnings.tsx: now a pure display component ({firstName, html}) — dropped the fetch/button/busy/err and the slug prop; shows the new intro text + the pre-generated HTML.
- NOTE: the public POST /api/events/[slug]/personalized (the old on-demand generator) is now unused by the UI — left in place (claimed-member gated, doesn't store) but could be removed later.
- tsc clean; eslint only the pre-existing header-logo <a> warning.

## Progress Update as of 2026-06-12 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Header "Events" nav now always links straight to /events (public page) for everyone — removed the claim-gating that forced unclaimed/signed-out visitors into the ClaimProfileModal (on /profile) or home (elsewhere). A signed-out visitor on a founder profile can now click Events and reach the events list.

### Detail of changes made:
- src/components/SiteHeaderNav.tsx: dropped eventsClaimContext prop, handleEventsClick, claimOpen state, and the ClaimProfileModal; Events NavItem is now href="/events" (isActive still suppressed on event detail pages via eventsAsLink).
- src/app/(authed)/profile/page.tsx: removed the now-unused eventsClaimContext prop.
- /events is public (the (authed) layout doesn't hard-gate auth; events/page.tsx uses getCurrentViewerContext which handles signed-out). tsc + eslint clean.

## Progress Update as of 2026-06-10 6:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the ability to delete your own endorsement. New DELETE /api/endorsements (claimed-member only, scoped to the caller's own row by fromEvaluationId so you can't delete someone else's; co-sign contributions cascade-delete via FK, freeing all contributors' points). In the edit form ("Edit your endorsement"), a red "Delete" button now sits bottom-right (ml-auto), with a window.confirm guard; on success it closes the editor + router.refresh.

### Detail of changes made:
- src/app/api/endorsements/route.ts: DELETE handler.
- src/components/MemberEndorsements.tsx: EndorseForm gains deleting state + remove() (DELETE fetch, confirm), and a red outline Delete button shown only in edit mode.
- tsc + eslint clean.

## Progress Update as of 2026-06-10 6:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Member Endorsements (src/components/MemberEndorsements.tsx): (1) once the viewer has already endorsed someone, the "Endorse <name>" compose box is hidden — they edit via the pencil on their existing endorsement card. This also fixes the "form didn't clear after saving" bug (after router.refresh the viewer's endorsement is in the list → alreadyEndorsed → box hidden). DB already enforces one-per-pair (endorsements fromToUnique), so the save was upserting, not duplicating. (2) Points input no longer shows a default "0" — empty until the user types.

### Detail of changes made:
- alreadyEndorsed = viewerOwnEvaluationId != null && endorsements.some(e => e.fromEvaluationId === viewerOwnEvaluationId); compose form now gated on `viewerCanEndorse && !alreadyEndorsed`.
- points input: value={points === 0 ? "" : points} (empty instead of 0; no placeholder).
- tsc + eslint clean.

## Progress Update as of 2026-06-10 5:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
OG social-card (src/app/api/og/route.tsx): bumped the gap between the "[Name]'s" line and the "Festival Score" label from marginTop 6 → 18 (was visually tight under the 72px name). Affects newly-generated cards; platform-cached unfurls persist until refreshed.

## Progress Update as of 2026-06-10 5:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(1) Root-cause fix: reEvaluate (re-score) now PRESERVES existing recommendations (stable item ids) when the owner has already rated them, so re-scoring a rated profile no longer orphans their IRL-event answers. (2) Built remapOrphanedRatings + script to fix ALREADY-orphaned ratings (LLM maps each orphaned response to the current item it corresponds to, re-points it). Ran it for Samuel Odio: all 7 ratings remapped correctly (0 unmapped), verified 0 orphaned.

### Detail of changes made:
- src/lib/eval-pipeline.ts: before the re-score UPDATE, if existing.recommendations.items overlap any recommendation_responses.item_id, set recommendationsUpdate={recommendations: existing.recommendations} (spread after ...rest to override the fresh run's). Imports recommendationResponses.
- src/lib/event-recommendations.ts: NEW remapOrphanedRatings(evalId, model) — LLM maps orphaned response item_ids → current item ids (1:1, slug+text+category signal; enriches orphan text from snapshots when available), re-points recommendation_responses (+ recommendation_visibility) item_id. Skips collisions (target already rated).
- scripts/remap-orphaned-ratings.ts: NEW runner (--dry scope, --only/--exclude). Ran --only=samuel → 7 remapped, $0.01.
- PRD/scoring-rubric-v0.0.1.md: changelog entry (no point-logic change).
- tsc clean.

### Bulk remap result (2026-06-10 ~5:35 PM):
- Ran remap across ALL orphaned profiles (incl. drodio per follow-up). 34 of 37 ratings recovered across 10 profiles (Vitaly 7, Deepak 7, Jonah 6, drodio 4, Stephane 3, Ruud 2, + 4 singles). Final: only 2 profiles / 3 ratings remain orphaned — drodio (2 no-match) + Sarina (1 collision: best match already rated). Those 3 are genuinely unmappable (no distinct current item) and stay hidden-as-unrated via the rendering fix. Total remap cost ~$0.06.

### Potential concerns to address:
- The PLAIN reframe (regenerateEventRecsForEval) still mints fresh ids and orphans; only reEvaluate + the preserving reframe variant are safe. If the plain reframe is ever re-run on rated profiles, use regenerateEventRecsPreservingRatings instead.

## Progress Update as of 2026-06-10 4:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the /samuel-odio bug where IRL-event ratings rendered on empty "custom" rows BELOW the actual questions. Root cause: when recommendations.items get regenerated (re-score OR reframe mints fresh ids), existing recommendation_responses orphan; the rating widget hydrated ANY non-matching response as a custom draft — so orphaned SYSTEM ratings showed as phantom editable rows. Fix: only hydrate custom drafts from genuine user-added rows (source="user"); orphaned system ratings no longer render (their questions just show unrated).

### Detail of changes made:
- src/components/Recommendations.tsx: SavedResponse gains `source`; custom-draft hydration filters to isUserRow (source==="user", or legacy null-source with "custom-" id prefix). Orphaned system responses excluded.
- src/app/(authed)/profile/page.tsx: savedResponses now passes r.source.
- scripts/diagnose-recs.ts: NEW read-only diagnostic (handle → current items vs responses, flags orphans). Confirmed Samuel: 7/7 responses orphaned (e.g. spc-thesis-dinner vs current spc-ai-thesis-dinner).

### Potential concerns to address:
- ROOT CAUSE (systemic): every re-score/reframe regenerates recommendations.items with NEW ids, orphaning saved ratings. The widget fix hides the mess, but the owner's actual answers are then lost-to-view (questions show unrated). Real fix = preserve/remap ratings across regeneration (stable ids, or remap on write). regenerateEventRecsForEval already has a preserving variant; the SCORER path (reEvaluate) does NOT preserve — worth addressing so re-scoring a rated profile stops blanking their answers.
- Samuel's 7 ratings are recoverable only by fuzzy semantic/category remap to the new items (1:1 by topic) — not done (risky to auto-map). Offer to the user.

## Progress Update as of 2026-06-10 4:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Renamed the 1-4 IRL-event rating labels: Hell No→Unlikely, Soft No→Possibly, Soft Yes→Probably, Hell Yes→Definitely. Updated all three RATING_LABELS constants (rating widget, admin Claimed table, IRL email) + doc comments (schema, irl-email, event-recommendations).

### Detail of changes made:
- src/components/Recommendations.tsx, src/lib/admin-claimed.ts, src/lib/irl-event-email.ts: RATING_LABELS = ["Unlikely","Possibly","Probably","Definitely"].
- src/db/schema.ts + comment refs updated for accuracy.
- NOTE: 3 duplicate RATING_LABELS constants still exist (drift risk) — worth consolidating into one shared constant later.

## Progress Update as of 2026-06-10 4:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built + ran the cheap title-ONLY backfill (no re-score) to populate credibility_title for the ~1,700 scored profiles left null by the SCHEMA_HINT bug. Generates the one-sentence headline from already-stored evidence (score breakdown reasons + recommendations.summary + profile.identity), mirroring the CREDIBILITY TITLE rubric spec. Verified quality on Arash Ferdowsi → "Dropbox co-founder and CTO who took the first YC company public, now angel investing in AI" ($0.003).

### Detail of changes made:
- NEW src/lib/credibility-title.ts: generateCredibilityTitle(evalId, model) — loads breakdown/recommendations/profile, builds a focused prompt, parses {credibilityTitle}, writes evaluations.credibility_title. Skips evals that already have a title or score 0; writes nothing when the model returns null (still too thin). Named credibility-title.ts (NOT credibility.ts) so it doesn't trip the scoring-rubric-doc pre-commit hook.
- NEW scripts/backfill-credibility-titles.ts: targets credibility_title IS NULL AND score>0 AND source<>'code', highest score first; --dry (scope+cost, no LLM/writes), --signal=, --limit=, --concurrency=, --only=/--exclude=.
- Full prod run COMPLETE (--concurrency=8): 1,597 titles written, 103 skipped (model returned null = still too thin, correctly left null), 0 failures, $3.57 total. Verified /arash-ferdowsi + /jensen-huang now populated. (Companion to the SCHEMA_HINT fix in the prior commit, which makes NEW scores emit titles going forward.)
- tsc + eslint clean.

### Potential concerns to address:
- Titles are model-generated from stored evidence; owners/admins can edit any via the inline EditCredibilityTitle (→ /api/profile/title). Spot-check a sample for accuracy.
- Still worth a unit test asserting every SCORING_SCHEMA top-level key appears in SCHEMA_HINT, to prevent this drift class from recurring.

## Progress Update as of 2026-06-10 3:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Root-caused + fixed why most profiles have no credibility title above their badges (e.g. /arash-ferdowsi, /jensen-huang). The SCHEMA_HINT output contract in eval-pipeline.ts (the authoritative TS shape the scoring model is told to emit) OMITTED credibilityTitle, even though the rubric describes it and SCORING_SCHEMA accepts it (.catch(null)). So the model never emitted it → null every run; re-score's preserve-on-empty kept the null. Added the field to SCHEMA_HINT.

### Detail of changes made:
- src/lib/eval-pipeline.ts: added `credibilityTitle: string | null` to SCHEMA_HINT (after companyStage, mirroring SCORING_SCHEMA order).
- PRD/scoring-rubric-v0.0.1.md: changelog entry (no point-logic change).
- scripts/diagnose-titles.ts: NEW read-only diagnostic (resolves handles → title/signal/score/runs).
- Prod read-only diagnosis (user asked "why"): /arash-ferdowsi (signal=high, score 520) and /jensen-huang (signal=high, score 2031) both had credibility_title=NULL. Scope: high-signal 299 total, 276 NULL title (only 23 have one); 19 of those null ones were re-scored in the last 2 days and STAYED null → confirmed systematic, not thin-signal.

### Potential concerns to address:
- BACKFILL NEEDED: 276 high-signal (+ medium/low) profiles still have NULL titles; they only populate on a fresh (re)score AFTER this fix deploys. Options: (a) re-score affected profiles (full score ~$0.06 ea ≈ $17 for the 276 high-signal), or (b) build a cheap title-only generation pass (like event-recs reframe, ~$0.005 ea ≈ $1.40) that fills credibilityTitle where null + signal not thin. Not yet done — awaiting user choice.
- This is the same class of bug as the earlier industries preserve-on-empty issue: SCHEMA_HINT must stay in sync with SCORING_SCHEMA. Worth a test asserting every SCORING_SCHEMA top-level key appears in SCHEMA_HINT.

## Progress Update as of 2026-06-10 3:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profile tweaks: (1) public family badges now ordered partner/spouse → kids → pets → other (was newest-first); (2) "People you've endorsed" → "Members you've endorsed", reformatted to one line each — name +N pts then as much of the endorsement body as fits on one line, truncated with …; (3) "Member Endorsements" section now full-width/left-justified and hidden entirely when there are no endorsements and the viewer can't add one (dropped the "No endorsements yet." empty state). The owner "Members you've endorsed" list was already gated to hide when empty.

### Detail of changes made:
- src/lib/family-constants.ts: added familyBadgeOrder(rel) (partner/spouse=0, kids=1, pets=2, other=3).
- src/lib/family.ts: getPublicFamilyBadges sorts rows by familyBadgeOrder (stable → newest-first holds within each group).
- src/app/(authed)/profile/page.tsx: heading rename; byMe row is now a single truncating flex line — gold name link (shrink-0), "+N pts" (shrink-0), then the body in quotes via renderMentions(body).map(s=>s.text).join("") (strips @[Name](id) markers to plain names) in a min-w-0 truncate span between shrink-0 quote glyphs so it ellipsizes mid-quote. Added renderMentions import.
- src/components/MemberEndorsements.tsx: early-return null when endorsements.length===0 && !viewerCanEndorse; section gets w-full; removed the empty-state <p>.
- tsc clean. eslint: only pre-existing header-logo <a>/<img> warnings (commit 30ef02d), not from these edits.

## Progress Update as of 2026-06-10 2:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
EXECUTED the rating-preserving reframe on prod for the recoverable profiles (per user decision: skip drodio "already correct"; do-best on other recoverable; leave unrecoverable as-is). Added a --exclude flag to the migration script to omit drodio. Restored 16 orphaned ratings; left the 31 truly-lost (incl. Vitaly) untouched.

### Detail of changes made:
- scripts/reframe-preserve-ratings.ts: added --exclude=<substr> (id/name) filter.
- PROD WRITE (evaluations.recommendations) via `--target=prod --exclude=7b03e43b`: updated John Welch (7 ratings, 14 events), Sarina Regehr (7 ratings recovered, 1 still lost, 14 events), Janice Williams Oliver (2 ratings, 9 events). 10 unrecoverable skipped (no write). $0.02 Sonnet total. drodio (7b03e43b) excluded.
- Verified: post-run dry-run shows affected 14→12; Welch & Janice fully off the list; Sarina down to her 1 lost; drodio + Vitaly + others unchanged.

### Potential concerns to address:
- 31 orphaned ratings remain truly lost (no snapshot text), incl. Vitaly Golomb 0/7 — intentionally LEFT for now per user. They still render "(untitled)" in /admin/claimed. Revisit options later: leave / delete orphaned recommendation_responses / re-derive via re-score + re-rate.
- Root cause of the original orphaning (regenerateEventRecsForEval minting fresh ids) is unchanged — any FUTURE run of the plain reframe on a rated profile will re-orphan. If we reframe again, use regenerateEventRecsPreservingRatings instead.

## Progress Update as of 2026-06-10 2:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built "Option B" tooling to recover owner ratings orphaned by the priorities→events reframe (answers showing "(untitled)" in /admin/claimed). For each affected eval it recovers original priorities from scoring_runs snapshots, reframes EACH rated priority 1:1 into one event proxy REUSING the original item id (so recommendation_responses ratings re-attach by id — responses table untouched), and merges into current items. NOT YET EXECUTED on prod — the dry-run revealed most data is unrecoverable (see concern).

### Detail of changes made:
- src/lib/event-recommendations.ts: added reframeEachPriorityToEvent() (1:1, forces original id+category back by position so model id-drift can't break re-attach), recoverPrioritiesFromSnapshots() (scans scoring_runs.snapshot.recommendations.items by id), inspectOrphanedRatings() (read-only: orphanIds + recoverable/unrecoverable), regenerateEventRecsPreservingRatings() (executor; skips evals with no orphaned ratings / nothing recoverable).
- scripts/reframe-preserve-ratings.ts: finds affected evals via jsonb membership SQL (responses whose item_id not in current recommendations.items); --dry = read-only scope+recoverability+cost (no LLM/writes); execute runs the preserver with concurrency.
- tsc + eslint clean. Dry-run ran clean against prod.

### Potential concerns to address:
- DRY-RUN FINDING (prod): 14 affected profiles, 55 orphaned ratings — only 24 recoverable from snapshots, **31 truly lost** (no snapshot holds the original priority text). Only 3 fully recoverable (Daniel R. Odio 8, John Welch 7, Janice Williams Oliver 2) + Sarina Regehr 7/8. **Vitaly Golomb = 0/7 recoverable** (the profile the request was about). Likely cause: those evals' only scoring_runs snapshot post-dates the reframe (or predates recommendations), so it captured events/null, not the original priorities. Executing B would fix only the ~4 recoverable profiles and skip the rest. AWAITING user decision on the 31 lost ratings (leave as untitled / delete orphaned responses to clear noise / accept loss). No prod write made.

## Progress Update as of 2026-06-10 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the /admin/claimed columns click-to-sort (leaderboard-style), default = claim date descending. Reused the shared useSortable hook + sortRows engine (@/components/admin/sortable, @/lib/sort) — client-side since the data set is small. Sortable: Name, Email, Location, Claimed, # Answers, Events (by count), Founder, Investor, Combined.

### Detail of changes made:
- src/components/admin/ClaimedProfilesTable.tsx: module-scope ACCESSORS map (strings lowercased; claimed -> Date; counts numeric); useSortable(rows, ACCESSORS, "claimed", "desc"); renamed the detail-fetch callback to toggleOpen to avoid clashing with the sort toggle. Added a local `Th` sortable header (px-3 py-2 to match body cells — the shared SortHeader is px-4 py-3 and would misalign). Body now maps `sorted`. Empty cells sort last (sortRows) and the rank number is positional in the current sort.

## Progress Update as of 2026-06-10 1:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Expanded the /admin/claimed table with four new columns and made empty rows non-expandable. Columns added: Email (claimer's Clerk primary email, batched via clerkClient.users.getUserList by clerk_user_id — chunked to 100/call; falls back to the best verified profile_email when Clerk has none), Claimed (users.verified_at — set on EVERY claim in claim/callback, so no backfill needed), "# Answers" (count of recommendation_responses), and "Events attended" (one badge per non-removed event_attendees row → links to public /events/<slug>). Rows with no members-only data (no family, no answers, no emails) now render without a chevron and aren't expandable.

### Detail of changes made:
- src/lib/admin-claimed.ts: ClaimedProfileRow gains email/answerCount/events/hasDetail. loadClaimedProfiles SQL adds clerk_user_id to the primary_claim CTE, a fallback_email correlated subquery, answer_count, has_family/has_emails EXISTS, and a json_agg of attended events (slug+title, starts_at desc). New claimerEmails() helper batches Clerk emails. Events deduped by slug in JS. hasDetail = has_family || answerCount>0 || has_emails.
- src/components/admin/ClaimedProfilesTable.tsx: added Email (mailto), Claimed (toLocaleDateString), # Answers (right-aligned), and Events attended (badge links, target=_blank) columns; wrapper now overflow-x-auto; chevron + expand only render when row.hasDetail; detail row colSpan bumped to 9.
- tsc + eslint clean; smoke-tested against dev DB (email/claimed/answers/events/hasDetail all populate; non-detail rows correctly flagged).

### Note:
- "the email" column = the claimer's actual Clerk login email (truest "their email" for a claimed account), DB profile_email fallback. Distinct from the profile_emails list still shown in the expanded detail.
- Claimed date is users.verified_at; reliably set on every real claim. Prod coverage check was blocked by the prod-DB classifier (earlier prod request was retracted) — not needed; any rare legacy null would just show "—".

## Progress Update as of 2026-06-10 1:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Gave the Claimed Profiles left-nav item an icon: FiUserCheck (the same person glyph as Scored Profiles' FiUser, plus a checkmark) — visually says "claimed/verified person."

### Detail of changes made:
- src/components/admin/AdminNav.tsx: import FiUserCheck; ICONS["/admin/claimed"] = FiUserCheck.

## Progress Update as of 2026-06-10 12:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New admin section "Claimed Profiles" (left nav, under Scored Profiles, gated by view_profiles so all profile-viewing admins see it). A leaderboard-style roster of everyone who claimed a profile, with FULL admin visibility into members-only data — each row expands in place to reveal family/pets, IRL-event answers, and emails (ignoring the owner's visibility settings). Name links out to the user's real public profile.

### Detail of changes made:
- NEW src/lib/admin-claimed.ts: `loadClaimedProfiles()` (one row per claimed eval via DISTINCT ON evaluation_id — picks the high-confidence/most-recent claim when multiple; joins evaluations for name/scores/slug; computes profileHref via profileUrlFor; sorted by combined score desc) + `loadClaimedProfileDetail(evalId)` (ALL family_members incl. private with relationship/age/interests/visibility/publicShare/photo; all recommendation_responses mapped to {description, Hell No..Hell Yes, Public/Private} reusing the irl-email mapping; ALL profile_emails with status). Admin = sees everything; no visibility gating.
- NEW src/app/(authed)/admin/claimed/page.tsx: adminGate + can("view_profiles"); renders ClaimedProfilesTable.
- NEW src/components/admin/ClaimedProfilesTable.tsx (client): expandable rows, lazy-fetch detail on first expand (cached), name -> profile (new tab, boxed ExternalLinkIcon), family/events/emails sections.
- NEW src/app/api/admin/claimed/[evalId]/route.ts: requireGrant("view_profiles") + loadClaimedProfileDetail.
- src/lib/admin-nav.ts: added { /admin/claimed, "Claimed Profiles", main, view_profiles } under Scored Profiles.
- tsc + eslint clean; smoke-tested loadClaimedProfiles/Detail against dev DB (runs, 2 dev claims).

## Progress Update as of 2026-06-10 12:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Coalesced the IRL-event DROdio email to ONE per answering session (was one per rating click). Trailing debounce inside the route's after(): snapshot max(recommendation_responses.updated_at), wait 30s, send only if no newer answer arrived during the window (else that newer save's run sends). A burst of ratings -> one complete email.

### Detail of changes made:
- src/lib/irl-event-email.ts: `sendIrlEventAnswerEmailDebounced(evalId, origin)` + maxAnswerTime() helper; DEBOUNCE_MS=30s.
- src/app/api/recommendations/route.ts: after() now calls the debounced version.

## Progress Update as of 2026-06-10 11:56 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Email DROdio@festival.so whenever someone answers the IRL-event questions (the "Would you attend these IRL festival events?" ratings). SUBJ: "[Full name] [combined score] answered IRL event questions". BODY: name+score+profileURL, "Has requested these IRL Festival events:", then each rated item -> description / Score (Hell No..Hell Yes) / Visibility (Public/Private). Sends a FULL SNAPSHOT of the persons current answers on each rating save.

### Detail of changes made:
- NEW src/lib/irl-event-email.ts sendIrlEventAnswerEmail(evaluationId, origin): loads eval (name/score/recommendations), recommendation_responses (rating/editedText), recommendation_visibility (private items); maps itemId->description (editedText for custom, recommendations.items[].text for pre-populated); builds + sends via sendRawEmail to DROdio@festival.so. Self-catching (never breaks the save).
- src/app/api/recommendations/route.ts POST: after the upsert, runs it via next/server after() (post-response, non-blocking).
- Verified the built content against drodio prod eval (8 items, correct desc/score/visibility). tsc clean.

### Note:
- Fires per rating save = one email per answered item (each a growing snapshot). If too noisy, can debounce/coalesce to one per session.

## Progress Update as of 2026-06-10 11:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Recommendations PrivacySlider (the Public/Private toggle on the "Would you attend these IRL festival events?" rows): added a HOVER-ONLY hint (does not persist) — hovering Public shows "Anyone can see my score", hovering Private shows "Score is Private to members only". Like the Hell No..Hell Yes rating label but hover-only. Native title tooltips updated to match. Fixed-height hint line so the row does not jump.

### Detail of changes made:
- src/components/Recommendations.tsx PrivacySlider: hovered state + onMouseEnter/Leave per button + a small right-aligned hint span below the toggle.

## Progress Update as of 2026-06-10 10:33 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the cohesive Family/Kids/Pets feature: pets, clickable purple profile family badges, and a leaderboard "Family & Kids" filter. Filter taxonomy: Children (son/daughter/child) / Spouse / Partner / Dog / Cat / Other pet.

### Detail of changes made:
- family-constants.ts: added dog/cat/pet to RELATIONSHIP_OPTIONS (reuse the whole add/photo/visibility/badge flow). NEW FAMILY_FILTER_OPTIONS + FamilyFilter type + isFamilyFilter + relationshipToFamilyFilter + familyFilterRelationships + FAMILY_FILTER_LABELS.
- leaderboard-constants.ts: LeaderboardFilter gains family: FamilyFilter[].
- leaderboard.ts: parse ?family= CSV; buildLeaderboardWhere adds a facet = eval.id IN (select evaluation_id from family_members where public_share<>none and relationship in <selected buckets>).
- LeaderboardFilters.tsx: new "Family & Kids" FacetGroup (6 options). LeaderboardActiveFilters: family pills.
- family.ts getPublicFamilyBadges -> {label, filterKey}[] (filterKey via relationshipToFamilyFilter).
- profile/page.tsx: family badges now a TIGHT 2nd row under the main Badges (wrapped both in gap-2), DARK PURPLE, rounded-md, each a link to /leaderboard?family=<key>.
- Verified on prod: family=children -> 1 founder (DROdio, has public kids); dog/spouse -> 0 (none public yet). tsc clean; leaderboard tests 16/16.

### Note:
- Pets appear in the family form relationship dropdown automatically (Dog/Cat/Pet); publicShare gives a Dog/Cat/Pet badge; photo + visibility same as kids.

## Progress Update as of 2026-06-09 05:38 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two quick wins from a large batch of requests: (1) View Profile button on /account next to the Profile URL & Nickname header (links to /profile/<kind>/<slug>). (2) Badge roundedness: flattened the family form/section text PILLS from rounded-full to rounded-md (avatars/photos stay round) per DROdio disliking very-rounded pills. (Family-card visibility was ALREADY shown — FamilySection line ~104 "Visible to: …".)

### Still QUEUED (big cohesive Family/Kids/Pets feature — to design+build):
- Profile family badges: move directly under main badges, dark purple, rounded-md, tight 2nd row, clickable -> leaderboard filtered by that family-badge type.
- Leaderboard left filter section "Family & Kids": Children, Spouse (+Partner, +Pets).
- Pets: add Dog/Cat/Pet as relationship options (reuse family add/photo/visibility flow); filterable.
- App-wide rounded-full -> rounded-md sweep beyond the family files.

### Detail of changes made:
- src/components/ProfileSettingsSection.tsx: header row + View Profile link.
- src/components/FamilyMemberForm.tsx + FamilySection.tsx: pill rounded-full -> rounded-md (interest/viewer/suggestion/publicShare chips); avatars unchanged.

## Progress Update as of 2026-06-09 05:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Home splash (SplashForm): added an "Events" button (-> /events) to the right of the Leaderboard button, mirroring its style. The third button in the `flex gap-2` row also narrows the white flex-1 "Check My Score" CTA a bit (the "less wide" ask).

### Detail of changes made:
- `src/components/SplashForm.tsx`: new `<a href="/events">Events</a>` after the Leaderboard link.

## Progress Update as of 2026-06-09 05:19 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed: family-member photos silently not saving. The photo uploads multipart THROUGH the function (/api/account/family/[id]/photo), which 413s on >~4.5MB (a full phone photo), and the client swallowed the error (.catch(()=>{})) so the member saved but photo_url stayed null (confirmed on Darian Odio). Fix mirrors the event-photo fix: resize the photo to a web size in the BROWSER first (resizeImageForWeb) so it always fits, surface upload errors instead of swallowing, and reuse the just-created row id on retry so a failed-photo retry does not create a duplicate member.

### Detail of changes made:
- src/components/FamilyMemberForm.tsx: import resizeImageForWeb; new createdId state; save() uses existingId (initial.id || createdId) -> PATCH else POST + store createdId; photo upload now resizes first, checks pres.ok and setErr on failure (no silent catch).

### Note:
- Darian already exists (metadata saved, photo_url null). Re-edit him + re-add the photo and it will resize + upload.

## Progress Update as of 2026-06-09 05:07 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Family-member (kids etc) photos on /account are now click-to-expand fullscreen. Added a reusable ImageLightbox (thumbnail -> fullscreen dark overlay, close via backdrop/escape/X) and used it for the FamilySection photo thumbnails.

### Detail of changes made:
- NEW src/components/ImageLightbox.tsx (client): cursor-zoom-in thumbnail; z-100 overlay with max-h/w-90vh contain image.
- src/components/FamilySection.tsx: photo <img> -> <ImageLightbox>.

## Progress Update as of 2026-06-09 02:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
FamilyMemberForm photo field: replaced the bare `<input type=file>` with a dashed drop zone — a box with a dotted border + a plus sign + "Drag or select a photo". Click opens the file picker; drag-and-drop works (dragover highlights gold, drop applies the image). Preview chip stays to the left. Image-type guard on both paths.

### Detail of changes made:
- `src/components/FamilyMemberForm.tsx`: new `dragOver` state + `photoInputRef` + `applyPhoto(f)` helper (sets file + objectURL preview; ignores non-images). Drop zone is a button (click→picker) with onDragOver/Leave/Drop; hidden file input drives both click + change.

## Progress Update as of 2026-06-09 02:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New profile feature: clicking the profile PHOTO or the NAME opens a shareable "social card" modal — the photo (large, or initials fallback), name, founder/investor scores + leaderboard rank, and share buttons for LinkedIn, X/Twitter, Facebook, plus Copy link. Test: /profile/founder/janice-williams-oliver (has a photo).

### Detail of changes made:
- NEW `src/components/ProfileSocialCard.tsx` (client): wraps a trigger (avatar/name) → opens a centered modal (z-100, backdrop + Esc + ✕ close). Share intents open in a new tab; Copy uses navigator.clipboard with a "Link copied!" flash. Icons from react-icons/fa6 (FaLinkedinIn/FaXTwitter/FaFacebookF/FaRegCopy).
- `profile/page.tsx`: compute `socialCard` (imageUrl=claimedImageUrl, name=nickname??fullName, profileUrl = absolute canonical URL from request host + canonicalProfileUrl(row.id), founder/investor scores, rank=combinedP.rankFromTop). Wrapped the `<Avatar>` and the welcome-name (converted its `<p>`→`<span>` for valid nesting) in `<ProfileSocialCard>`.

## Progress Update as of 2026-06-09 01:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
1. Replaced the bare unicode "↗" everywhere with the boxed external-link glyph (the one already used on the homepage LinkedIn-finder, FindHandleHelper). Extracted it to a shared `ExternalLinkIcon` component; FindHandleHelper now imports it (was a local copy). No bare "↗" remains anywhere in src/.
2. Profile conflicts: added an "Un-link email" action per row — for a mis-link (two real DIFFERENT people sharing one email, e.g. Adeola Ayoola / Adeola Adesola), you keep BOTH profiles and just detach the email from the wrong one (no delete, no merge).

### Detail of changes made:
- NEW `src/components/ExternalLinkIcon.tsx` (box-with-arrow SVG, inline-aligned). Used in: FindHandleHelper (refactored off its local copy), AttendeesTable, ProfileConflictCard, AdminProfilePicker, admin/events/page.tsx, admin/events/[id]/page.tsx.
- NEW `POST /api/admin/profile/[evalId]/unlink-email` { email } (superadmin) — deletes the profile_emails row for (evalId, normalizeEmail(email)); profile untouched.
- `ProfileConflictCard.tsx`: "Un-link email" button per row (now: Un-link / Merge all into this / Delete profile).

## Progress Update as of 2026-06-09 01:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Part 2 — the MERGE action on /admin/pending profile conflicts. "Merge all into this profile" repoints the loser(s)' real relationships to the winner (Option A: winner keeps its own data), then deletes the losers. Tested on the DEV db with synthetic dup profiles before exposing to prod — the test CAUGHT a real bug (profile_slug_aliases columns are (alias_slug, evaluation_id), not (evaluation_id, slug, slug_kind)).

### Detail of changes made:
- NEW `src/lib/merge-profiles.ts` `mergeProfiles(winnerId, loserIds)`: repoints users(claims), profile_emails (drop-collide-then-repoint on (eval,email)), event_attendees, event_photos.uploaded_by; adds loser slug as a winner alias (redirect); then deleteEvaluationsCascade(losers). Rarer links (host/sponsor/connections/chat/family) are NOT repointed — the cascade deletes them with the loser (safe trade for a duplicate). UUID-validated raw SQL (no injection). Repoints-first/delete-last (no neon-http txn).
- `src/lib/profile-delete-cascade.ts`: EXTENDED to cover ALL ~20 FK tables (was missing the 0037 ones: event_attendees/photos SET NULL; profile_emails, host/sponsor, connections+prefs+contact-sharing, chat threads/comments/votes, family, applicants DELETE). Fixes Delete on profiles with attendance/connections AND backs the merge cleanup.
- NEW `POST /api/admin/profile/[evalId]/merge` (superadmin) { loserIds }.
- `ProfileConflictCard.tsx`: "Merge all into this" button per profile (warns if verdict=different); confirm dialog.
- DEV TEST: synthetic winner+loser w/ shared email, claim, attendee → merge → all moved (dup email dropped), alias added, loser gone, winner intact. PASS.

## Progress Update as of 2026-06-09 12:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin /admin/pending "Profile conflicts" — Part 1 of the merge/delete feature. Made LinkedIn URLs CLICKABLE, added an auto "same person vs different people (mis-link)" VERDICT per conflict, and a per-profile DELETE button. Most conflicts are mis-links (same email on two different same-first-name people, e.g. Adeola Ayoola vs Adeola Adesola) → the verdict steers the admin to DELETE the wrong twin rather than merge strangers.

DESIGN DECISION for the upcoming Merge (Part 2): Option A — winner keeps ALL its own data; only losers' RELATIONSHIPS repoint to the winner; losers deleted. NO "fill blanks" (DROdio reversed his earlier choice — for different people, filling blanks would import a stranger's data).

### Detail of changes made:
- NEW `src/lib/conflict-verdict.ts` + test (5 cases): pure surname-based verdict (same/different/uncertain). TDD green.
- `src/components/admin/ProfileConflictCard.tsx`: now a client component — clickable LinkedIn (shortened + ↗), verdict badge (amber=different/green=same), per-profile "Delete profile" → existing POST /api/admin/profile/[id]/delete (superadmin) → router.refresh.

### Next (Part 2 — Merge):
- `mergeProfiles(winnerId, loserIds)` repointing ~24 evaluation FK tables (claims/users, profile_emails, event_attendees, connections+prefs+contact-sharing, host/sponsor, chat threads/comments/votes, family, photo uploaded-by, event_applicants) with unique-constraint conflict handling, add loser slug as winner alias for redirects, then delete losers. NOTE: deleteEvaluationsCascade is INCOMPLETE (misses the 0037 tables) — extend it too. Neon-http has no interactive txn, so order repoints-first / delete-last. TDD the conflict-key handling. Merge button + API in the card.

## Progress Update as of 2026-06-09 11:20 AM Pacific
*(Most recent updates at top)*
(Rebased onto origin/main first to pull in the chat + photo-recap features merged after my last push.)

### Summary of changes since last update
1. Chat thread title was BLACK on /events/[slug]/chat/[threadId] — the `<h1>` had no text-color class so it fell back to default. Added `text-zinc-100` (site convention).
2. Diagnosed "captions + added-by not showing on event photos" (e.g. id5j1bw0): NOT a display bug — PhotoCarousel renders both when present, and getEventPhotos joins them. The DATA is missing: all of this event's photos are source=admin, caption=null (captionManual=false), uploaded_by_evaluation_id=null. Captions are AI-generated via a MANUAL "Caption all" admin action (caption-all route, Sonnet vision) that was never run for this event. The "added by" credit is recorded only on uploads AFTER the photos POST started setting uploadedByEvaluationId (recent PR) — these photos predate it. Backfilling captions next.

### Detail of changes made:
- `src/app/(authed)/events/[slug]/chat/[threadId]/page.tsx`: h1 -> `text-zinc-100`.

### Done / open:
- DONE: backfilled AI captions for id5j1bw0 via `scripts/caption-event-photos.ts --slug=id5j1bw0 --execute` — 30 photos captioned (2 already had one). Captions now display on the event page.
- OPEN (offered): captioning is still a MANUAL "Caption all" per event — other events won't have captions until triggered. Could auto-run caption generation after upload (async; Sonnet cost+latency per photo) so it "just works" — product/cost decision. Old photos' "added by" is unbackfillable (uploader unknown); new uploads record it.

## Progress Update as of 2026-06-09 10:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed leaderboard deep-link scroll (`/leaderboard?e=<id>`): clicking "#332 on Leaderboard" from a profile didn't scroll to that row because the leaderboard only had the first page loaded (infinite-scroll via IntersectionObserver), so a deep row (e.g. Bryan Casey, combined rank ~326) wasn't in the DOM and `scrollIntoView` hit a null ref. Now the client auto-pages until the highlighted row is loaded, then the table scrolls to it.

### Detail of changes made:
- `src/components/LeaderboardClient.tsx`: new effect — when `highlightEvalId` is set and the row isn't yet in `pagedRows` (and not in search, cursor remaining, not already loading), call `loadNextPage()`. Chains page-by-page until the row appears or the tail is reached. (loadNextPage's own guard prevents double-fetch with the IntersectionObserver.)
- `src/components/LeaderboardTable.tsx`: the scroll effect now also depends on `highlightPresent` (row is in the rendered set), so it fires WHEN the row pages in, not only on the initial ref-less mount.
- The profile link is `/leaderboard?e=<id>` (combined board) and the shown rank is the COMBINED rank, so no sort change needed — verified Bryan is high-signal, combined rank ~326.

## Progress Update as of 2026-06-08 07:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event attendee table connections UX (public event page, AttendeesTable):
- Connected attendees (status approved or contact shared) now sort to the TOP, ordered by combined score desc; everyone else stays score-desc beneath.
- The connected state is a GREEN "Connected" button. On hover it turns RED and reads "Disconnect" (CSS group-hover swap).
- Clicking Disconnect removes the connection (DELETE) and the row reverts to a "Connect" button so you can reconnect.

### Detail of changes made:
- `src/lib/attendee-connections.ts`: new `removeConnection(eventId, evalA, evalB)` — deletes the connectionRequests row in EITHER direction.
- `src/app/api/events/[slug]/connect/route.ts`: new DELETE { toEvaluationId } → removeConnection (attendee-gated, same as POST).
- `src/components/events/AttendeesTable.tsx`: `orderedRows` (useMemo, connected-first by score); `disconnect(toId)` handler (DELETE → status "none"); connected rowAction is the green→red hover Connected/Disconnect button + contact links below. `ProfileMiniTable rows={orderedRows}` (it preserves order).

## Progress Update as of 2026-06-08 07:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the public event page (events/[slug]), moved the "Allow event connection requests?" control (EventConnectionPref) from BELOW the attendees table to directly UNDER the "Attendees" title, before the table. Relabeled it "Allow event connection requests from attendees?".

### Detail of changes made:
- `AttendeesTable.tsx`: new optional `belowTitle?: ReactNode` slot rendered right after the `<h2>Attendees</h2>`.
- `events/[slug]/page.tsx`: pass `belowTitle={connection ? <EventConnectionPref…/> : undefined}`; removed the old after-table `{connection && <EventConnectionPref…/>}` block.
- `EventConnectionPref.tsx`: h3 label -> "Allow event connection requests from attendees?". NOTE: this component is shared — the same relabeled control is the account-page global default (scope="global"); the new wording reads fine there too.

## Progress Update as of 2026-06-08 07:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Investigated "unmatched attendees" on the admin event page. Attendee↔profile matching is by EMAIL ONLY (`matchEvaluationIdByEmail` in event-attendees-sync.ts: Luma guest email -> profile_emails canonical, then evaluations.found_email fallback; NOT linkedin handle or name). FINDING: most "unmatched" rows are actually a DISPLAY BUG — `listEventAttendeesAdmin` set `matched: !!lb` where `lb` came from `getLeaderboardRowsForEvalIds`, which EXCLUDED signalQuality='low'. So a Luma guest correctly email-matched to a thin/low-signal profile (Jonah Larkin, score 11; Dan Kim 3; etc.) showed as "unmatched". On event 59afa1e8: 8 "unmatched" = 7 matched-but-low-signal + 1 genuinely unmatched (Andrey Akselrod, no email match).

### Detail of changes made:
- `src/lib/leaderboard.ts`: `getLeaderboardRowsForEvalIds(ids, opts?:{includeLowSignal})` — by-id lookup can now keep low-signal rows (default unchanged for other callers).
- `src/lib/event-attendees-admin.ts`: pass `{includeLowSignal:true}`; `matched` is now `true` whenever the row has an evaluationId (lb only supplies score/href). Verified on prod: event 59afa1e8 now 23 matched / 1 unmatched (was 16/8).

### Feature BUILT — probable match + Apply for unmatched attendees:
- `event-attendees-admin.ts`: `AdminAttendeeRow.probableMatch` (best same-name profile via searchLeaderboard, skipping already-attached evals; fan-out capped at 40 unmatched). New `linkAttendeeProfile(eventId, attendeeId, evaluationId)` sets the row's evaluationId.
- `api/admin/events/[id]/attendees/[attendeeId]/route.ts`: new PATCH { evaluationId } → linkAttendeeProfile (manage_events + canAccessEvent gated).
- `AttendeeManager.tsx`: unmatched rows render a `MatchPicker` — shows "Probable match: [name · company] [Apply]" + a "not right?/find a match" toggle opening an inline name search to pick a different profile. Apply/pick PATCHes then refreshes. (Design: single best + search fallback, per DROdio.)
- Verified on prod: search finds existing names (Jonah 1 hit, Grace Chen 2); the event's lone genuine-unmatched (Andrey Akselrod) has no profile so shows "find a match" (correct). tsc clean.

## Progress Update as of 2026-06-08 06:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Resumed + shipped the GitHub Match-Confidence improvement. Added `usernameEncodesName(fullName, login)` to `enrichers/github.ts` (0/0.5/1) and wired it into `githubMatchConfidence`: a handle that encodes the subject's specific name adds +0.4, AND the non-correlating-company penalty softens from −0.4 to −0.15 when ownership is strong (full-name match + name-encoding handle). This fixes the over-conservative matcher that stripped legit owners (Al Guerrero 66→4, Gowtham 59→4, Zane Salim 125→113) whose GitHub company field wasn't in our scraped data — without re-admitting mis-attaches (a handle won't encode a different-named victim: `helsont` ≠ "Helison Tavares", `kaito-project` ≠ its 5 people). Also clears the `helsont` residual on re-score.

### Detail of changes made:
- `src/lib/enrichers/github.ts`: new exported `usernameEncodesName`; `githubMatchConfidence` ghUser param now includes `login`; loginScore*0.4 + strong-ownership-softened company penalty. Company correlation still 0.95 (strongest).
- `tests/lib/github-enricher.test.ts`: 16 cases incl. the real keep/strip cases (zane/gowtham/alejandro keep; helison/kaito strip). TDD, all green. tsc clean.
- Rubric doc changelog updated (Rescore-to-apply; known common-name limitation noted).

### Re-score results (scripts/rescore-github-fix-apply.ts, executed):
- RESTORED (legit github re-attached): zane-salim -> zanesalim, grace-chen-3 -> gracechen, alejandro-al-guerrero -> alguerrero.
- NOT restored (defensible — handle is an ABBREVIATION that doesn't encode the name, no company correlation, so conservatively left off): victor-piskunov (vicpi), samit-khalsa (samvit), gowtham-sundaresan (p-gowtham; its name is also mangled to "Gowdham Gowdham").
- helison-tavares residual NOT auto-cleared: the github `helsont` account's own data conflates Helson Taveras (LinkedIn helsontaveras, Keep Technologies) and Helison Tavares (Granorte), so the matcher keeps it for both. Evidence says helsont = HELSON. scripts/strip-helison-github.ts STRIPPED it from the Granorte/Helison profile (user-authorized). ✅ Done.
- After helison strip, collisions 14 -> 1: only `gracechen` on grace-chen-3 (LucidAct CEO — verified owner) AND grace-chen (thin, no company, score 0 — unverified). scripts/strip-grace-chen-github.ts strips it from the thin grace-chen to reach ZERO collisions; user said yes but the prod-DB classifier wants the target explicitly named — to be run via `! npx tsx scripts/strip-grace-chen-github.ts --execute`.

## Progress Update as of 2026-06-08 06:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed: a signed-in user who already claimed a profile was still shown the "Claim" CTA (UnclaimedNotice) on their own profile (DROdio at /profile/drodio). Root cause: the page's `isClaimedByAnyone` only counts `matchConfidence="high"` claims (anti-impersonation), but ALL of drodio's 3 claims are "medium". They're medium because his eval was scored from a LinkedIn URL (no stored publicEmail), so a LinkedIn-OAuth claim can only NAME-match → medium; the LinkedIn vanity handle that WOULD prove ownership isn't available via Clerk OIDC (ClerkClaim has only email + first/last name — confirmed). So "high" is unreachable for LinkedIn-sourced-no-email profiles.

Targeted fix: don't nag a signed-in viewer to "Claim" a profile they already claimed (any confidence). Added `viewerHasClaim` (= viewer has any users row on this eval) and gate UnclaimedNotice on `!isClaimedByAnyone && !viewerHasClaim`. Owner-grade privileges (public avatar/nickname/location) STILL require "high" via isOwner/primaryClaim — no impersonation surface change.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: new outer-scope `viewerHasClaim`, set `= !!match` in the signed-in block; UnclaimedNotice gate now `!isClaimedByAnyone && !viewerHasClaim`.

### Resolved:
- DONE (user-authorized): upgraded DROdio's own claim row (clerk_username="drodio" on the drodio eval) match_confidence medium -> "high" via scripts/upgrade-drodio-claim.ts, so /profile/drodio now reads as publicly claimed (avatar/nickname show; no "Claim" for anyone). Legitimate (his own account on his own profile); the systemic medium-cap for LinkedIn-sourced-no-email profiles remains (Clerk doesn't expose the LinkedIn handle for a high auto-match).
- GitHub Match-Confidence improvement (username-encodes-name) — still parked; resume next.

## Progress Update as of 2026-06-08 05:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed: the sponsor/host "People at this sponsor" admin picker couldn't find existing profiles like Dan Kim ("dan kim isn't on the leaderboard yet"). Root cause: AdminProfilePicker reuses the PUBLIC `/api/leaderboard/search`, whose `baseWhere` excludes `signalQuality="low"` rows. Dan Kim is `signalQuality=low` (score 3), so the public search hid him even though his profile resolves at `/profile/investor/dan-kim`. Added an opt-in `includeLowSignal` flag that ONLY the admin picker sends.

### Detail of changes made:
- `src/lib/leaderboard.ts`: `baseWhere` -> `baseWhereFor({includeLowSignal})`; `searchLeaderboard` now ALWAYS calls `baseWhereFor({includeLowSignal:true})` — per DROdio, leaderboard SEARCH includes everyone (low-signal too) for all users, public included. Code-redeemed/hidden/test rows still excluded. The paginated LISTING still hides low-signal (unchanged).
- Verified against prod: search "dan kim" returned (none) before, now returns 2 Dan Kims (incl. the low-signal f3/i0). tsc clean; leaderboard-where/-filter tests pass.
- (Dropped the earlier opt-in `includeLowSignal=1` flag on the route + AdminProfilePicker — search is always-include now, so the flag was redundant.)

### Note / parked:
- GitHub match-confidence improvement (a username-encodes-name signal — to restore legit owners like Al Guerrero/Gowtham that the conservative matcher stripped, and to clear the `helsont` residual) is DESIGNED but not yet implemented; interrupted by this bug. Resume next.

## Progress Update as of 2026-06-07 10:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Re-score pass over the 28 github-collision profiles COMPLETE: 24 changed/stripped, 4 kept, 0 failed. GitHub-username collisions dropped 14 -> 1. Wins: kaito-project removed from all 5 unrelated people; garrytan victims (andres-montoya, jason-han) re-resolved to their OWN correct githubs (montoyaandres, hanjjason); drodio impostor "Daniel Odio" (Costa Rica) stripped (real DROdio untouched).

### Trade-off:
The confidence-gated matcher is conservative — when it cannot strongly re-verify a github it drops it, so a few LIKELY-LEGIT owners also lost their github + points: zane-salim 125->113, alejandro-al-guerrero 66->4, gowtham-sundaresan 59->4. Net = far fewer wrong attributions, slightly fewer right ones (safe direction). The big drops suggest those githubs were not confidently verifiable; revisit the threshold if those are real.

### Residual (1):
gh=helsont still on Helson Taveras (Keep Technologies — legit) AND Helison Tavares (Granorte, Brazil, score 0 — wrong). Names too similar (Helson Taveras ~ Helison Tavares) for the matcher to split. Harmless (wrong one is score 0). Can manually strip github from the Granorte profile to close it.

## Progress Update as of 2026-06-07 10:33 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Running a re-score pass over the 28 unclaimed profiles caught in GitHub-username collisions (the 13 mis-attach groups), so the shipped confidence-gated matcher (githubMatchConfidence) can strip the wrongly-attached GitHub. Non-destructive (reEvaluate updates in place, preserves claims). drodio (claimed) skipped. In progress via scripts/rescore-github-misattach.ts --target=prod --execute (background).

### Detail of changes made:
- NEW scripts/rescore-github-misattach.ts: finds github-username collision groups (count>1), re-scores each UNCLAIMED member, logs gh before->after + score delta.
- Legit github owners keep theirs on re-score; mis-attach victims (e.g. kaito-project on 5 people, garrytan on 2, zanesalim->zane-qureshi) should drop it.

### Notes:
- Results pending the background run. Identity-dedup prevention (runEval) already shipped (28e72bd).

## Progress Update as of 2026-06-06 06:31 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PREVENTION for the same-person-two-LinkedIn-URLs duplicate (the Max Stoiber bug): added identity-based dedup to runEval. After computeFreshScore, before insert, if the freshly-scored GitHub username already belongs to a profile under a DIFFERENT linkedin_url AND name + (website OR company) corroborate, return that existing profile instead of creating a twin. Conservative on purpose — a missed merge is just a visible dup; a wrong merge fuses two real people. The corroboration (the "Max Stoiber test") is what keeps it from merging the GitHub MIS-ATTACH cases (same github wrongly on different people — their company/website differ).

### Detail of changes made:
- NEW src/lib/identity-dedup.ts: isSamePerson(a,b), personIdentityFromProfile(fullName, identity), normalizeWebsite(). Rule: same github username + nameMatches + (website===website OR company===company). TDD: tests/lib/identity-dedup.test.ts (11 cases incl. the two-Laura-Lins and kaito-project mis-attach guards) — all green.
- src/lib/eval-pipeline.ts runEval: after fields are built, query evaluations for same github username (JSON path) with a different linkedin_url; if isSamePerson, return rowToResult(twin). Added ne, sql to the drizzle import.
- tsc clean. Full suite green except tests/lib/select-top-profiles.test.ts, which is in vitest.ci.config NOT_YET_ISOLATED (real-DB, excluded from CI) and unrelated to this change.

### Still open / optional:
- The 13 GitHub mis-attachment groups remain (wrong github on different people). githubMatchConfidence (already shipped) should reject these on re-score; a targeted re-score pass would strip them. Not yet done.

## Progress Update as of 2026-06-06 06:04 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
User found a duplicate: festival.so/profile/founder/max-stoiber AND max-stoiber-2 are the SAME person (Max Stoiber, GitHub mxstbr) with two different linkedin_url values. Root cause: runEval dedups ONLY on linkedin_url (lookupCachedEval + onConflictDoNothing target=linkedin_url), so the same person via two different LinkedIn URLs makes two profiles. Fixed this instance (kept clean slug max-stoiber, repointed to canonical linkedin.com/in/mxstbr, deleted max-stoiber-2 — delete FIRST because linkedin_url is unique).

Then scanned ALL of prod for more. KEY FINDING: of 14 GitHub-username collisions, max-stoiber was the ONLY true duplicate. The other 13 are GitHub MIS-ATTACHMENTS (one GitHub wrongly on DIFFERENT people — confirmed via the "same person?" test: their company/website/location all differ). Worst: gh=kaito-project on 5 unrelated people; gh=garrytan on 2; gh=drodio on the real DROdio (claimed) + a Costa Rican doctor "Daniel Odio". A second scan by shared website found only coworkers/cofounders (Zepto, Whatnot, SpaceX…), no dupes. So Max Stoiber was the only real duplicate; nothing else is safe to delete.

### Detail of changes made:
- NEW scripts/dedupe-max-stoiber.ts (one-off, dry-run/--execute). Applied to prod.
- Prod now has a single max-stoiber -> linkedin.com/in/mxstbr.

### Open / proposed:
- PREVENTION (not yet built): add identity-based dedup to runEval — before insert, if the freshly-scored GitHub username matches an existing eval AND name + website/company corroborate (the "max-stoiber test"), return the existing profile instead of creating a 2nd. Tight corroboration avoids merging the mis-attach false-positives. Awaiting approach approval (pipeline auto-merge vs admin flag-for-review).
- SEPARATE BUG: 13 GitHub mis-attachment groups (wrong GitHub inflating wrong people). githubMatchConfidence (shipped earlier) should now reject these — re-scoring the affected profiles would strip the wrong GitHub. Not yet done.

## Progress Update as of 2026-06-06 01:23 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Applied the final 12 hand-vetted duplicate-profile deletions to PROD (the long-deferred batch-2/3). Used a NEW one-time audit script that deletes EXACTLY the curated [delete,keep] list — no LLM re-judge — so it can't drift onto profiles we chose to keep. Dry-run first showed all 12: each delete-target present + unclaimed, each keeper present; executed; re-ran dry-run to confirm all 12 now gone. Deferred dedupe backlog is cleared.

### Detail of changes made:
- NEW scripts/dedupe-apply-12.ts: hardcoded 12 pairs; per-pair guards (skip if delete-target is CLAIMED or keeper missing); loads prod env from .env.prod.local; --target/--execute like dedupe-cleanup.ts. Ran against prod host ep-fragrant-surf; 12 deleted, 0 skipped via deleteEvaluationsCascade.
- Deleted slugs: christine-zhang-2, christina-c-2, jaskaran-singh, aishwarya-kamat, dian-lin, nel-jacques, l-venkatraman, d-ramkumar, chris-s-2, scott-t-2, ganesh-morye-2, maria-jose-nunez.

### Notes:
- All session code (spider chart, admin pill bottom-left, recap DB-leak fix, event-photo client upload + web-resize) is on main + deployed to prod. Blob storage provisioned (founder-festival-blob) + prod redeployed.

## Progress Update as of 2026-06-06 01:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event photos are now downscaled to a web size in the BROWSER before upload, so we never ship the full-res original (often 5-15MB off a phone). New `src/lib/resize-image.ts` `resizeImageForWeb(file)` decodes via `createImageBitmap(file, { imageOrientation: "from-image" })` (bakes in EXIF rotation), scales the longest edge to ≤2048px on a canvas, and re-encodes JPEG quality 0.82. Best-effort: if the browser can't decode (e.g. HEIC on Chrome) or canvas/ctx is unavailable, it returns the original unchanged so the upload still works. EventPhotoManager calls it per file before `upload()`.

### Detail of changes made:
- NEW `src/lib/resize-image.ts` (client util; SSR-guarded; no DB). Constants MAX_EDGE=2048, QUALITY=0.82.
- `src/components/admin/EventPhotoManager.tsx`: `const file = await resizeImageForWeb(original)` before the direct-to-Blob upload.

### Potential concerns to address:
- HEIC outside Safari can't be canvas-decoded → falls back to uploading the original HEIC, which then won't render in an `<img>` on Chrome. iPhone-Safari uploads decode+re-encode to JPEG fine. If desktop-HEIC becomes a real case, add a heic2any decode step.
- MAX_EDGE/QUALITY are fixed defaults; easy to tune if photos look too soft or too heavy.

## Progress Update as of 2026-06-06 01:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two-part fix for admin event-photo uploads. (1) INFRA: festival.so had no Vercel Blob store connected, so uploads 503'd ("BLOB_READ_WRITE_TOKEN missing"). Created a dedicated public store `founder-festival-blob` (store_BnMYahZWWclCX5LJ), connected it to the project for prod+preview+dev (token injected), and redeployed prod. NOTE: the connect only worked after `vercel link` — the CLI didn't see the worktree's project link, so the first two create-store attempts left it unconnected. (2) CODE: with the token in place, uploading a real (large) photo then failed with "Unexpected token 'R', \"Request En\"… is not valid JSON" — a plain-text 413 "Request Entity Too Large" from Vercel because the file was streamed THROUGH the serverless function (req.formData → put), which has a ~4.5MB request-body cap. Switched event photos to client-side direct-to-Blob uploads.

### Detail of changes made:
- NEW `src/app/api/admin/events/[id]/photos/upload/route.ts`: `@vercel/blob/client` `handleUpload` token handshake. `onBeforeGenerateToken` runs `requireGrant("manage_events")` (cookies present on the client's token request), returns allowedContentTypes (jpeg/png/webp/gif/avif/heic), addRandomSuffix, maximumSizeInBytes 25MB. `onUploadCompleted` is a no-op (see below).
- `src/app/api/admin/events/[id]/photos/route.ts` POST: no longer accepts multipart/streams the file. Now takes small JSON `{ blobUrl, visibility?, caption? }`, validates blobUrl matches `*.public.blob.vercel-storage.com`, inserts the row, returns it. (Recording client-side gives immediate UI feedback AND works on localhost, where Vercel's server-to-server onUploadCompleted callback can't reach.) Dropped the `put` import + the 503 token guard (no longer streams).
- `src/components/admin/EventPhotoManager.tsx`: onUpload now `upload(path, file, { access:"public", handleUploadUrl: .../photos/upload })` straight to Blob, then POSTs `{ blobUrl, visibility }` to record. Bytes bypass the function → no 4.5MB ceiling.

### Potential concerns to address:
- Host-icon (`/api/admin/hosts/[id]/icon`) and sponsor-logo (`/api/admin/sponsors/[id]/logo`) routes STILL stream through the function (multipart → put), so a >4.5MB upload there will hit the same 413. Logos/icons are usually small so left as-is; convert them to client uploads too if it bites.

## Progress Update as of 2026-06-06 12:34 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
ROOT-CAUSED + FIXED the /admin/events/[id]/recap "Something went wrong" error. It was a server/client boundary leak: the client component `EventPrioritiesEditor` imported VALUES (`PRIORITY_CATEGORIES`, `CATEGORY_COLORS`) from `@/lib/event-priorities`, which begins with `import { db } from "@/db"`. That dragged the whole server module — and the Neon client — into the BROWSER bundle. `@/db` runs `neon(process.env.DATABASE_URL)` at module-eval; in the browser DATABASE_URL is undefined, so it threw "No database connection string was provided to neon()" during hydration → bubbled to `global-error.tsx` ("Something went wrong"). The browser console stack (`at neon … at module evaluation`) confirmed it. (Earlier I masked this exact error in my repro harness by setting a dummy DATABASE_URL — lesson logged.)

### Detail of changes made:
- NEW `src/lib/event-priorities-shared.ts`: pure, DB-free constants/types (`PRIORITY_CATEGORIES`, `PriorityCategory`, `CATEGORY_COLORS`, `isPriorityCategory`, `PriorityInput`). No `@/db` import.
- `src/lib/event-priorities.ts`: now imports/re-exports those from the shared module; keeps only the DB-backed `getEventPriorities`/`setEventPriorities` + `EventPriority` type. Server callers (recap page, priorities API route) unchanged — re-exports cover them.
- `src/components/admin/EventPrioritiesEditor.tsx`: imports the constants from `@/lib/event-priorities-shared` instead.
- Repro/verify: importing the client component with DATABASE_URL unset threw before, imports cleanly after. tsc clean.

### Pattern to watch (potential concern):
- Any "use client" component that imports a VALUE from a lib that top-level-imports `@/db` will crash that page the same way. `@/db` calls `neon()` at module load, so the leak is a hard runtime throw, not just dead weight. Worth a lint rule (no `@/db` in the client graph). For now the recap tree is clean.

## Progress Update as of 2026-06-06 12:19 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Moved the floating super-admin profile toolbar (AdminProfileBox: "Admin: Scoring Log | Re-Score Me | Hide | Delete") from fixed top-right to fixed bottom-left. It overlapped the layout's "Admin" link + account avatar, which live in the fixed top-right chrome (`(authed)/layout.tsx`, `sm:fixed sm:top-3 sm:right-4`). The whole top row is occupied (logo + SiteHeaderNav on the left, Admin link + UserBadge on the right), so there's no room for the ~420px pill at the top — bottom-left clears everything and the desktop left margin is empty. Also moved the minimized invisible 52×52 hotspot from `right-0 top-0` (which was overlapping the Admin link and intercepting its clicks even when minimized) to `bottom-0 left-0`.

### Detail of changes made:
- `AdminProfileBox.tsx`: expanded pill `fixed right-3 top-3` → `fixed bottom-3 left-3`; minimized hotspot `fixed right-0 top-0` → `fixed bottom-0 left-0`; updated the doc comment.
- `profile/page.tsx`: updated the stale "fixed top-right" comment above `<AdminProfileBox>`.

### Investigation logged (recap "Something went wrong"):
- Ruled out by reproduction: server render path is null-safe (SSR of the page + all 6 components with empty data passes); all 6 prod data queries succeed for the event; migration 0037 (recap tables/columns) IS applied to prod; client mount of all 6 components — including the tiptap RichTextEditor — passes in jsdom; tsc clean. No segment `error.tsx` exists, so any throw bubbles to `global-error.tsx` ("Something went wrong"). Could not reproduce statically — need the actual prod runtime/browser-console error to pinpoint.

### Still open:
- /admin/events/[id]/recap "Something went wrong" — needs the live error (browser console for a client throw, or Vercel runtime logs for a server throw).
- dedupe-12 deletions pending user approval.

## Progress Update as of 2026-06-05 11:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed overlapping spider charts on the public event page. The two "Avg founder/investor composition" radars sit in a sm:grid-cols-2 grid (each ~half width), but CredibilityRadar put its SVG (380px, shrink-0) and legend/value list side-by-side via a sm: VIEWPORT breakpoint — so in the narrow grid cell the legend got crushed to ~40px and its "16/100…" values overflowed onto the chart. Added a `stacked` prop (SVG above legend) used by the event page.

### Detail of changes made:
- `CredibilityRadar.tsx`: new `stacked` prop → inner layout flex-col (chart over legend), svg mx-auto. Default unchanged (profile page stays side-by-side).
- `EventAnalyticsSection.tsx`: pass `stacked` to both radars.

### Still open:
- /admin/events/[id]/recap "Something went wrong" — data queries + components all check out by inspection; need the live error (vercel logs streaming).
- dedupe-12 deletions pending user approval.

## Progress Update as of 2026-06-05 11:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the GitHub identity check with a layered confidence model so same-named-different-person collisions (Sir Richard Branson vs the @rbranson/OpenAI engineer) are rejected. The prior fix (drop LinkedIn-handle guess) wasn't enough — github.com/rbranson surfaced in web results and was auto-trusted.

### Detail of changes made:
- `enrichers/github.ts`: `githubMatchConfidence(fullName, ghUser, fromKnownUrl, subjectCompanyTokens)` (0-1, accept >=0.5). Company correlation = ~certain; company-mismatch penalizes; surfaced-URL alone no longer sufficient. Added company/location to GhUser; build subject company tokens from LinkedIn text + highlights.
- tests rewritten for the model (incl. the Branson rejection). Re-scoring Richard Branson next to confirm rbranson drops.

## Progress Update as of 2026-06-05 10:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the Richard Branson identity conflation. The "what you likely need" summary publicly stated the profile conflates Sir Richard Branson with Rick Branson (@rbranson github engineer) and Richard D. Branson (medical researcher). Root cause: the github enricher tried the LinkedIn handle `rbranson` as a github username → github.com/rbranson (a different person who also happens to be named Richard Branson) → name-match can't separate them.

### Detail of changes made:
- `enrichers/github.ts`: removed LinkedIn-handle-as-github-username candidate (collision risk). Real github still found via Exa URLs + name-derived handles.
- `scoring.ts`: recommendations.summary prompt forbids identity/data-quality meta-notes (it's public) — silently ignore mismatched enrichment data.
- TODO: re-score Richard Branson on prod with the fix so the public note clears; OpenAlex same-name attribution is a known harder case (left for later).

## Progress Update as of 2026-06-05 09:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Leaderboard: a millions-range score (e.g. Bill Gates 1,737,155) made the status check-mark wrap to a second line. Added whitespace-nowrap to the founder/investor score cells (desktop td + mobile span) so the number + marker stay on one line; the auto-layout table then claims the score column's width and the existing badge-"fit" logic shows fewer badges for that row automatically.

### Detail of changes made:
- `LeaderboardTable.tsx`: whitespace-nowrap on founder/investor score cells (desktop) and the mobile score span.

## Progress Update as of 2026-06-05 09:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two small UI tweaks: home-page heading "Do you Qualify for Membership?" → "Which Events Do You Qualify For?"; leaderboard Badges filter no longer an inner scroll area (removed max-h-80 overflow-y-auto) so all badges render on the page.

### Detail of changes made:
- `SplashForm.tsx` heading copy.
- `LeaderboardFilters.tsx` Badges list: dropped the capped scroll container.

## Progress Update as of 2026-06-05 09:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Smart dedupe of the 51 deferred duplicate profiles. Added `scripts/dedupe-cleanup.ts`: for each same-person pair (shared email, both name-resolved), it feeds the LLM (Sonnet) everything we know — handle, scored company/identity, the email domain (usually the real company), data richness, claim status — and judges which LinkedIn is genuinely the person, only flagging HIGH-confidence deletions. Executed the 18 high-confidence verdicts on prod (2394 → 2376); 33 MEDIUM/LOW left for review (genuinely ambiguous — no domain signal or both plausible).

### Detail of changes made:
- `scripts/dedupe-cleanup.ts` (DRY by default; --execute deletes high-confidence twins via the cascade). Judge combines email-domain↔company match, handle↔email/name match, richness, and different-same-named-person detection.
- 18 deleted (keep → delete), e.g. emil-mikhailov-2 (xix.ai match) kept over emil-mikhailov (Canadian car business); harvey-hongwei-li (hwlical↔hwli.cal email) over harvey-li (a different investor). Keepers verified present.

### Potential concerns to address:
- 33 deferred dups remain (MEDIUM/LOW confidence). Re-run `dedupe-cleanup.ts --target=prod` for the latest reasoning; clean ad-hoc via the pill Delete button.
## Progress Update as of 2026-06-05 08:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Follow-up to the rescore-failure fix (#196): make the founder/investor status markers populate reliably so a re-score never wipes them and fresh scores get a status even when the model drops the field.

### Detail of changes made:
- `scoring.ts`: founderStatus/investorStatus prompt descriptions now marked REQUIRED ("always emit; if unsure use 'never'").
- `eval-pipeline.ts`: `computeFreshScore` now backfills any status the model omitted via the cheap `classifyStatuses` Haiku call (confirmed Patrick → current/current in isolation); `reEvaluate` preserves a previously-known status when a re-score returns null (no marker wipe).
- Synced to origin/main (#196). Root cause of the original failure was my bare-required enums; #196 made them `.nullable().catch(null)`.

### Potential concerns to address:
- The Haiku fallback is best-effort (catches transient gateway errors → null); preserve-on-null + #196 are the safety nets. Single prod scores won't rate-limit.

## Progress Update as of 2026-06-05 07:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Split the status marker into per-role markers: a current/past/never marker now sits inline to the right of BOTH the Founder and Investor scores (removed from the combined score). Added `investor_status` mirroring founder_status (scoring field + prompt + Haiku backfill).

### Detail of changes made:
- `FounderStatusMarker.tsx` → generic `StatusMarker({role, status})`: inline (align-baseline, inherits the score's size), tooltip pops right over the combined area at z-50, font reset so it isn't smushed. founder/investor tooltip wording.
- `profile/page.tsx`: marker by the Founder score (role=founder) and the Investor score (role=investor); removed from combined.
- DB `investor_status` column (migration 0035); `investorStatus` in SCORING_SCHEMA + prompt (GP/partner/angel signals; founding != investing); written in eval-pipeline; low-signal → never.
- Backfill (`backfill-founder-status.ts`) now does both columns in one Haiku call (`classifyStatuses`), idempotent per-column. Verified on dev (Joe Gebbia: founder ✓ + investor ✓).

### Potential concerns to address:
- Prod investor backfill running via the now-allowed script; deploy after it completes (code selects investor_status).

## Progress Update as of 2026-06-05 06:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the founder-status tooltip rendering smushed: it sat inside the big score span and inherited font-display + tracking-tight. Reset to font-sans + tracking-normal + normal-case so "Current founder" renders at natural width (whitespace-nowrap).

## Progress Update as of 2026-06-05 06:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Founder-status marker tweaks per design feedback: moved it from next to the NAME to next to the big COMBINED score, ~2x bigger (text-4xl), and the tooltip now appears to the RIGHT of the marker instead of below.

### Detail of changes made:
- `FounderStatusMarker.tsx`: tooltip repositioned right (`left-full top-1/2`), default size `text-4xl`, tooltip text fixed at `text-sm`.
- `profile/page.tsx`: marker moved out of the welcome heading and into the combined-score span. Verified on dev (Kimbal Musk: 243 + green ✓).

## Progress Update as of 2026-06-05 06:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Founder-status SHIPPED to prod data: column applied + backfilled on prod (1,524 low-signal → never; 870 scored → 641 current / 149 past / 80 never). Re-rebased onto main again (#184 Scoring Log landed mid-flight and added its own 0033 migration — renumbered mine to 0034 to resolve the collision). Deploying the code now.

### Detail of changes made:
- Prod backfill ran via `scripts/backfill-founder-status.ts --target=prod` (user-invoked `!` — the auto-mode guard blocks prod DDL/writes from the agent).
- Migration renumbered: main's `0033_chunky_norrin_radd` kept; ours regenerated as `0034_fluffy_tony_stark.sql` (founder_status column). tsc + 44 tests green.

### Potential concerns to address:
- Prod column + data are live; deploying the code completes the feature. Future agent prod-DB writes still gated unless the user adds the allow-rule.

## Progress Update as of 2026-06-05 05:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Rebased founder-status onto latest origin/main (picked up #181 scoring v0.0.8, #183 hn, #178 leaderboard — clean, no conflicts; #181 added isCurrentFounder/isPastFounder rubric rules that coexist with the founderStatus field). Made the backfill script self-contained so it can apply the column + backfill in one secret-free command (`--target=prod`).

### Detail of changes made:
- `scripts/backfill-founder-status.ts`: loads the target env file itself, runs `ADD COLUMN IF NOT EXISTS`, then backfills. Verified on dev.
- All 39 founder-status/scoring tests green post-rebase; tsc clean.

### Potential concerns to address:
- Prod schema change is gated by the auto-mode safety classifier (cites the "no db changes from a checkout" note). Unblocking via a scoped allow-rule per the user's explicit "proceed on table / don't wait for approvals" directive.

## Progress Update as of 2026-06-05 05:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the abandoned A/B/C "founder-potential" idea with a **founder-status** flag (current / past / never) determined in scoring, shown as a superscript marker by the profile name. (The A/B/C grade was dropped: percentile thresholds structurally selected established high-scoring founders, not non-founders — and skills already count toward the founder score, so a skilled non-founder is never a literal 0.)

### Detail of changes made:
- DB: new nullable `evaluations.founder_status` column (migration `0033_left_mongoose.sql`). Applied to DEV; **PROD column NOT yet applied** (safety-gated — see concerns).
- Scoring: `founderStatus` enum ("current"|"past"|"never") added to `SCORING_SCHEMA` + prompt instructions (judged on company-founding history, not skills). Written in `eval-pipeline` payloadToWriteFields; low-signal rows default to "never".
- Marker: `FounderStatusMarker.tsx` — superscript next to the name: green ✓ "Current founder" / yellow ✱ "Past founder" / red ✱ "Not (yet!) a founder" (pure-CSS hover tooltip). Wired into `profile/page.tsx` welcome heading and `LowSignalProfile`.
- Backfill: `scripts/backfill-founder-status.ts` — low-signal → "never" deterministically; scored rows classified by a cheap Haiku pass over stored data (`founder-status-classify.ts`), null→"never" backstop. Ran on DEV: 37 current / 4 past / 180 never, 0 unknown. Verified all three markers render (Kimbal Musk current, etc.).
- Tests: founder-status-classify parse test; updated scoring + scoring-schema fixtures for the new required field.

### Potential concerns to address:
- **PROD deploy is blocked on two DB ops the safety guard refuses from a checkout** (matches the user's own "no db changes from a checkout" note): (1) `ALTER TABLE evaluations ADD COLUMN founder_status text`, (2) the backfill UPDATE. Must run these (or approve them) BEFORE deploying the code — the deployed code selects `founder_status`, so prod would error without the column.
- Earlier P1 (claimable low-signal page) is already live; this builds on it.

## Progress Update as of 2026-06-05 04:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 1 of the low-signal-profiles epic: low-signal evals now render a claimable "Not enough public data to score" profile page instead of bouncing to /not-this-round, and homepage/search/rescore flows route there too.

### Detail of changes made:
- `src/lib/display-name.ts` — `humanizeLinkedinHandle` fallback name for low-signal evals (full_name is null). Tested.
- `src/components/LowSignalProfile.tsx` — claimable low-signal profile view (name, score 0, "Not enough public data to score", Claim CTA, events CTA).
- `profile/page.tsx` — low-signal branch renders LowSignalProfile (name = full_name ?? humanized handle, minimal isOwner check) instead of redirecting to /not-this-round.
- `SplashForm` / `MismatchOverlay` / `ReScoreButton` — low-signal results now go to `/profile?e=` (the page renders the claimable view).
- Verified on dev: christine-zhang (named) and jlpiga (null-name → "Jlpiga") render correctly.

### Still to do in this epic:
- P1 name backfill (set full_name from job-item input_name for existing low-signal). Leaderboard listing of zeros deferred to P3 (needs the A/B/C sort).
- P2 founder-potential screen; P3 A/B/C grade + UI.

## Progress Update as of 2026-06-05 03:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First commit on this branch: fixes the duplicate-profile / wrong-LinkedIn bug at its source (tab-separated CSV/paste parsing), adds email/company corroboration to LinkedIn name-resolution, and adds a superadmin Delete button to the floating profile pill. Also performed prod data cleanup (25 duplicate profiles deleted) via one-off scripts (not committed).

### Detail of changes made:
- **Tab-delimiter parsing** (`src/lib/csv-to-lines.ts`, `src/lib/parse-paste-input.ts`): both parsers only split on commas, so Google-Sheets/Excel/TSV pastes collapsed the whole `Full\tFirst\tLast\tEmail` row into the name field (~1,440 of 4,137 job items were mangled). `parseCsv` now detects a tab delimiter; `parsePasteInput` splits tab rows, takes field[0] as the name, and skips repeated first/last columns when picking a company. Tests in the matching `.test.ts` files.
- **Corroboration in resolution** (`src/lib/find-linkedin-handle.ts`): new `pickResolvedCandidate` + `emailDomainBrand`. `resolveLinkedinUrl(name, company, email)` now prefers the name-passing candidate whose headline/snippet matches the company or email-domain brand; still auto-attaches the top name-match when nothing corroborates ("stricter but automatic"). Wired `inputEmail` through `scoring-tick`. Tests in `tests/lib/resolve-candidate.test.ts`.
- **No dedup change needed**: `runEval` already dedupes same resolved URL via `lookupCachedEval` + `onConflictDoNothing`.
- **Admin Delete button in the floating pill** (`src/components/AdminDeleteButton.tsx`, wired in `profile/page.tsx` `<AdminProfileBox>`), superadmin-gated, reuses the existing delete route + cascade.
- **Prod cleanup (data, not code):** 25 duplicate profiles deleted (23 auto via shared-email + URL/claimed keeper; 2 verified examples sam-odio/mayank-mehta). ~51 all-name-sourced dupes deferred for manual review (see DEFERRED-DUPLICATES.md, kept out of the repo).

### Potential concerns to address:
- The ~51 deferred duplicates still exist on prod; clean via the new pill Delete button.
- Upcoming epic (P1–P3): surface low-signal profiles, a cheap founder-potential screen, and A/B/C grading — will touch the leaderboard query/sort (note PR #179 leaderboard-sort-resync just landed) and the scoring pipeline.
