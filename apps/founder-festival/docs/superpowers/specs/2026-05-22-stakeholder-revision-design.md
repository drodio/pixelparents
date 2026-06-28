# Stakeholder Revision — Festival.so v1 → Event Vetting Platform

**Date**: 2026-05-22
**Branch**: `polish` (will fork to a new branch for implementation)
**Status**: Approved (operator confirmed OD-1, OD-2, OD-6 on 2026-05-22) — in implementation on `events-v1` branch
**Author**: Claude (Opus 4.7), from stakeholder PRD by DROdio

---

## 1. Context

This spec extends the existing Festival.so MVP (specs `2026-05-21-festival-mvp-design.md` + `2026-05-22-claim-flow-identity-matching-design.md`) with the requirements that came out of the Jackie / John / Gerald discovery call. The shipped product today is a **public scoring funnel**: anyone pastes a LinkedIn URL on `/`, gets evaluated against the founder + investor rubric, and lands on `/welcome` with their score and a leaderboard percentile. There is also an `/admin` surface gated by `ADMIN_EMAILS` for bulk-scoring lists of people.

This spec turns that funnel into the **event vetting platform** the three stakeholders described. The shipped scoring engine is the foundation; what's missing is everything between "we have a score" and "the right people are in the room on June 2."

**Hard deadline**: John Steinberg's sponsored event is **June 2, 2026** — ~11 days from today. P1 scope below is what has to ship to make that event work without manual triage.

---

## 2. What exists today (don't rebuild)

- **Founder + Investor scoring** (`src/lib/scoring.ts`): two independent rubrics, summed into a combined score. `companyStage` is already a field (idea / pre-seed / seed / series-a / series-b / series-c+ / growth / public / acquired). ✅ Satisfies F1.1–F1.6 already.
- **Identity claim flow** (`/welcome` → `/claim` → callback): LinkedIn OAuth, GitHub OAuth, email-link via Clerk. Match-confidence levels (high / medium / low). ✅ Satisfies F4.1.
- **Admin bulk scoring** (`/admin`): paste-list → cron-driven worker (`/api/cron/scoring-tick`) processes 5 items / minute via Sonnet or Opus. Cost-estimated. Tracks per-row status. ✅ Partial F2 (operator-side scoring), but not yet a per-applicant approval queue.
- **Score caching / re-score** (`/api/rescore`): one canonical eval per LinkedIn URL.
- **Public leaderboard** + per-eval OG cards.

The new work is **layered on top** — no rewrite of the scoring path.

---

## 3. The product shift

Today's product is **person → score**. The stakeholder revision is **event → curated room**. The shipped scoring engine becomes both the curator's filter (admin-only) AND the applicant's reward for applying (their score is shown after submit, same as on the public funnel).

Two entry points going forward, sharing one post-submit page:

```
PUBLIC SELF-DISCOVERY (existing)               EVENT APPLICATION (new)
─────────────────────────────────              ──────────────────────────────────────
/                                              /events/<slug>
  ↓ submit LinkedIn URL                          ↓ click "Apply to attend"
                                               /events/<slug>/apply
                                                 ↓ submit LinkedIn URL + email
              ─────────────────────────────────────────────────────────────
              POST /api/eval (sync, ~10-20s with EvalProgress UI)
              → creates evaluations row if new, reuses if cached
              ─────────────────────────────────────────────────────────────
                                  ↓
/welcome?e=<id>                                /welcome?e=<id>&applied=<slug>
   shows score + breakdown +                      shows score + breakdown +
   leaderboard percentile                         NEW BANNER: "Application
   "Show me events" → /claim                      received for <Event Title>.
                                                  We'll be in touch within 48 hours."
                                                ↓ admin reviews (silent)
                                               Email: "You're in" OR "We'll keep you
                                                       in the loop for future events"
```

**Score visibility (OD-2 — operator decision 2026-05-22):** the applicant DOES see their score on the post-submit page, regardless of which entry point they used. The decision (approved / denied / pending / waitlist) is still admin-curated and only surfaces via email — and the language on the denied path is always future-events-framed, never rejection-framed. So the applicant sees their score; they don't see "you didn't make the cut."

This addresses John's "just make it easy and let the AI work in the background," gives the applicant transparency about their own data, and respects Jackie's no-rejection-language constraint without going to the score-invisible extreme.

---

## 4. Phased plan

### Phase 1 — Ship for June 2 (P0, ~11 days)

Goal: John runs his sponsored event with auto-approval; Jackie can run a curated-vetting event in parallel without exposing scores; both work from one admin surface.

| ID | Feature | PRD ref | Why P1 |
|---|---|---|---|
| P1.1 | `events` + `event_applicants` schema | — | Foundation |
| P1.2 | Event creation in admin (criteria builder) | F3.2, F5.1 | John needs to configure his event |
| P1.3 | Public event page + application form | F4.2 | Applicant entry point |
| P1.4 | Event-application flow reuses `/welcome` post-submit (shows score) | — | Operator OD-2 decision: applicants see their score |
| P1.5 | Admin applicant queue (per event): approve / pending / deny | F2.1, F2.2 | Jackie's "first pass" workflow |
| P1.6 | Auto-approval rule engine with audit log | F3.1, F3.4 | John's "test auto-approving" ask |
| P1.7 | Stage-aware criteria filter (pre-seed vs Series B+, founder vs investor) | F1.5, F3.2 | John's sponsor targeting |
| P1.8 | Bulk approve / deny by score+stage filter | F2.4 | Jackie's "filter 600 down to 100" |
| P1.9 | Applicant transactional emails (approved / future-events) | F7.5 (subset) | Required to close the loop |
| P1.10 | Discount/access code bypass on event-application | F3.3 | VIP invites |

**Explicitly NOT in P1** (deferred): Luma sync (P3), sponsor brief generator (P2), partner portal (P2), audience composition preview (P2 or stretch P1), score dispute process (P3), multi-admin roles beyond allowlist (P3).

### Phase 2 — Post-June 2 (next 30 days)

Goal: scale to Gerald's DECODE and Jackie's District use cases; give sponsors and partners the surfaces they actually need.

| ID | Feature | PRD ref |
|---|---|---|
| P2.1 | Future-events waitlist (interest expressed; notified on match) | F4.3 |
| P2.2 | Sponsor brief generator (downloadable PDF/MD) | F5.6 |
| P2.3 | Audience composition preview (before publish) | F5.3 |
| P2.4 | Partner portal (read-only first: see your event, see who came via your link) | F6.1, F6.6 |
| P2.5 | Partner marketing asset generator (newsletter / LinkedIn / WhatsApp copy) | F6.4 |
| P2.6 | Sub-segment recommendation per event (Gerald's "which DECODE bucket") | F6.2 |
| P2.7 | Outbound invite blast to score-qualified District members | Jackie's outbound ask |
| P2.8 | Threshold alerting (80% capacity) | F3.6 |

### Phase 3 — When the platform proves out

Goal: bi-directional automation with external tools; multi-sided matching as a real product feature.

| ID | Feature | PRD ref |
|---|---|---|
| P3.1 | Luma bi-directional sync (Festival ID field, auto-approval push, capacity pull) | F7.1–F7.5 |
| P3.2 | Founder→sponsor surface ("relevant sponsors for you") | F5.5 |
| P3.3 | Multi-admin role-based permissions (Owner / Reviewer / Read-only) | F2.8 |
| P3.4 | Post-event sponsor report (target vs actual composition) | F5.4 |
| P3.5 | Score dispute / re-review process | OD-3 |
| P3.6 | Profile verification badges | F4.5 |

---

## 5. Data model (P1 additions)

```ts
// events — one row per gathering
events {
  id              uuid PK
  slug            text UNIQUE NOT NULL          // /events/<slug>
  title           text NOT NULL
  hostName        text                          // "John Steinberg", "Jackie Albright"
  hostEmail       text                          // for ops contact
  startsAt        timestamp tz NOT NULL
  endsAt          timestamp tz
  venue           text
  capacity        int                           // null = unlimited
  status          text NOT NULL                 // draft | open | closed | past
  approvalMode    text NOT NULL                 // manual | auto | hybrid
  // Criteria: JSON blob with founderScore.min, investorScore.min,
  // stages (allowed list), side ("founder" | "investor" | "either"),
  // geo (countries/regions, optional), needs (optional)
  criteria        jsonb NOT NULL DEFAULT '{}'
  // Sponsor block (used in P2 for brief generator, but stored from P1).
  sponsor         jsonb                         // { name, targetStages, targetNeeds, brandColor }
  description     text                          // public-facing event description
  createdByEmail  text
  createdAt       timestamp tz DEFAULT NOW()
  updatedAt       timestamp tz DEFAULT NOW()
}

// event_applicants — one row per (event, person)
event_applicants {
  id              uuid PK
  eventId         uuid REFERENCES events(id) ON DELETE CASCADE
  evaluationId    uuid REFERENCES evaluations(id)        // null until scored
  // Captured at form submit; populated even before score lands.
  linkedinUrl     text NOT NULL                 // canonicalized
  fullName        text
  email           text                          // required at submit
  needs           jsonb                         // self-reported needs (F1.7)
  // Status from the admin's view. Applicant never sees this raw value.
  // pending  — submitted, scoring not yet done
  // scored   — scored, awaiting admin (manual events) or auto-rule (auto events)
  // approved — going to the event (triggers approval email)
  // denied   — admin denied OR auto-failed; soft message to applicant
  // waitlist — admin marked for "future events" pool (P2)
  status          text NOT NULL DEFAULT 'pending'
  // Why this status was set. Enum for auto-rules ("auto:score_min",
  // "auto:stage_match", "auto:bypass_code"), free-text for manual decisions
  // ("Jackie: known good"). Visible only to admins.
  decisionReason  text
  // Private admin note. Never shown to applicant.
  adminNote       text
  // Bypass code that bypassed score requirements (P1.10).
  bypassCodeId    uuid REFERENCES bypass_codes(id)
  // Audit fields.
  decidedByEmail  text
  decidedAt       timestamp tz
  createdAt       timestamp tz DEFAULT NOW()
  updatedAt       timestamp tz DEFAULT NOW()
}

// event_invites — outbound invite tracking (P1.10 + P2.7).
// Generated from an outbound blast OR a partner portal share link.
// Lets us pre-fill the application form with their LinkedIn URL and
// know who the invite came from.
event_invites {
  id              uuid PK
  eventId         uuid REFERENCES events(id) ON DELETE CASCADE
  code            text NOT NULL UNIQUE          // short ID in the URL
  linkedinUrl     text                          // pre-fill, optional
  email           text
  source          text NOT NULL                 // "admin" | "partner:<slug>" | "outbound"
  redeemedByApplicantId uuid REFERENCES event_applicants(id)
  expiresAt       timestamp tz
  createdAt       timestamp tz DEFAULT NOW()
}
```

**Reuse**: `bypass_codes` already exists. Extend its semantics so a code can be scoped to a specific `eventId` (new nullable column), letting VIP invites bypass score gates on a per-event basis.

```sql
ALTER TABLE bypass_codes ADD COLUMN event_id uuid REFERENCES events(id);
```

**Reuse**: `evaluations` is keyed by `linkedinUrl`. An applicant who's been scored before via the public funnel won't re-run scoring — `event_applicants.evaluationId` just joins to the existing row.

---

## 6. UX flows (P1)

### 6.1 Event creation (admin)

```
/admin                           — already exists, add "+ New event" button
  ↓
/admin/events/new                — form: title, host, dates, venue, capacity,
                                   approval mode (manual/auto/hybrid),
                                   criteria builder (score min, stage allow-list,
                                   side, geo)
  ↓ submit
/admin/events/<id>               — event dashboard: applicant queue, criteria
                                   preview, share link, capacity counter
```

The criteria builder is a simple form (no UI-heavy rule engine for P1). Stored as JSON; evaluated server-side on every applicant submit.

### 6.2 Public event page

```
/events/<slug>                   — public landing (Spectral display H1 matching
                                   the rest of the site). Description, date,
                                   venue (general), and one CTA: "Apply to attend".
  ↓ click Apply
/events/<slug>/apply             — form: LinkedIn URL, email, full name,
                                   optional stage dropdown, optional
                                   needs checkboxes ("fundraising, hiring,
                                   BD, product, legal").
                                   Optional invite/access code field.
  ↓ submit
  ┌─ POST /api/eval (sync, ~10-20s, EvalProgress UI shown)
  │     → returns { evaluationId, signalQuality }
  │  POST /api/events/<slug>/apply { evaluationId }
  │     → creates event_applicants row with eval ID
  │  Auto-rule runs synchronously (no waiting for cron tick)
  └─ Client redirects:
       signalQuality === 'low'  → /not-this-round?e=<id>&applied=<slug>
       otherwise                → /welcome?e=<id>&applied=<slug>
```

The `applied=<slug>` query param triggers a banner above the score on `/welcome`:

> **Application received for <Event Title>.** We'll be in touch within 48 hours.

The banner uses the existing `link` gold accent. The query param is stripped after first render (same pattern as `claimed=` in `ClaimSuccessBanner`).

For the low-signal branch on `/not-this-round`, add an equivalent banner so the applicant knows their submission landed even though we didn't have enough public signal to score them confidently.

Because scoring is synchronous, the cron-tick auto-rule path becomes a fallback for race conditions (e.g., scoring tick had already started on the same URL just before the apply submit). The common case is: apply submit → eval row exists → auto-rule fires immediately in the apply handler → applicant lands on `/welcome` with their score and the banner; admin opens the queue and sees the application already in `approved` / `denied` / `scored` (for hybrid near-misses).

### 6.3 Auto-approval rule evaluation

On each applicant transitioning from `pending` → `scored`:

```
if event.approvalMode == 'manual':
  → stay 'scored', wait for admin
elif event.applicant matched bypass code:
  → 'approved' (decisionReason = "auto:bypass_code:<code>")
elif criteria match (founder/investor side, score >= min, stage in allow-list):
  → 'approved' if mode == 'auto'
  → 'approved' if mode == 'hybrid' AND confidence band is high
                                          (e.g., score 1.5× min)
  → stay 'scored' for admin review otherwise
else:
  → 'denied' if mode == 'auto'
  → stay 'scored' if mode == 'hybrid' (let admin see "near misses")
```

Every transition writes to a new `event_applicants_history` row (or simpler: append-only audit log row) capturing `applicantId, fromStatus, toStatus, reason, actorEmail, at`. P1 audit log lives in a single table:

```ts
event_decision_log {
  id, applicantId, fromStatus, toStatus, reason, actorEmail, at
}
```

### 6.4 Admin applicant queue

```
/admin/events/<id>
┌─────────────────────────────────────────────────────────────────────┐
│ Event: John's Sponsored Founder Dinner — June 2                     │
│ Capacity: 75/100  ·  Mode: hybrid  ·  Criteria: pre-seed+seed, ≥80  │
├─────────────────────────────────────────────────────────────────────┤
│ [Pending  23] [Scored  42] [Approved  68] [Denied  15] [Waitlist 0] │
├─────────────────────────────────────────────────────────────────────┤
│ Filter: side [Founder ▾] stage [any ▾] score [≥80] needs [—]        │
│ [Bulk approve]  [Bulk deny]  [Bulk move to pending]                 │
├─────────────────────────────────────────────────────────────────────┤
│ ☐ Name           Score (F/I)   Stage   Needs            Status  ⋯  │
│ ☐ Robert Eng     320 / 0       seed    fundraising      scored      │
│   [Approve] [Pending] [Deny] [Note]                                 │
│ …                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

- Filters mutate the URL (`?status=scored&minScore=80&stage=seed,pre-seed`) so links are shareable.
- Per-row actions are immediate; bulk actions confirm with a count first.
- The "Note" affordance opens an inline textarea (auto-save on blur) for admin-only context.
- "Pending" is the third state — Jackie's "leave anyone I'm not sure about" — and never surfaces externally. Applicants who are pending see the same "we'll be in touch" page; the difference is only that they don't get an outbound email until the pending state resolves.

### 6.5 Decision emails

| Status | Email sent | Subject | Body shape |
|---|---|---|---|
| `approved` | Yes | "You're in: <event title>" | Event details + add to calendar + Luma link if present |
| `denied` | Yes | "Thanks for applying to <event>" | "We're at capacity for this event but we'd love to keep you in the loop for future Founder Festival gatherings." No rejection language. |
| `waitlist` | Yes | Same as denied | (Distinct internal state for future-events follow-up in P2.) |
| `pending` / `scored` | No | — | Silent until a decision is made |

Transactional email backend for P1: keep it minimal. **Resend** (cheapest, lowest friction) via a thin `src/lib/email.ts` wrapper. One template per status, plain text + minimal HTML.

---

## 7. Stage-aware criteria (F1.5 detail)

`evaluations.companyStage` is already populated by the scoring rubric, but applicants today never set it themselves and it's only inferred for founders. Two changes:

1. **Self-reported override**: the apply form includes a "Where are you in your journey?" dropdown (pre-idea / pre-seed / seed / Series A / Series B+ / post-exit / I'm an investor). Stored on `event_applicants.needs.stage` (form data) and reconciled against the eval row at admin-review time. Admin sees both.
2. **Investor stage**: extend `evaluations` to capture `investorStageFocus` (jsonb array, e.g., `["pre-seed", "seed"]`) — derivable from the rubric's existing `investorBreakdown` reasons but worth lifting to a top-level field for filterability.

```sql
ALTER TABLE evaluations ADD COLUMN investor_stage_focus jsonb DEFAULT '[]'::jsonb;
```

The scoring schema (`SCORING_SCHEMA` in `src/lib/scoring.ts`) gets a new field `investorStageFocus: z.array(z.enum([...]))`. Existing rows get backfilled lazily on next re-score.

---

## 8. Open decisions

(Bias toward shipping P1 — these are flagged for operator review, not blockers.)

| # | Decision | Resolution | Notes |
|---|---|---|---|
| OD-1 | Auto-approval LIVE for John's June 2 event? | ✅ **Hybrid mode** (operator 2026-05-22) | Auto-approve obvious matches; queue near-misses for admin. Founder score floor for John's event: **50** (operator 2026-05-22). |
| OD-2 | Show score to applicants? | ✅ **Yes — on every path, including event application** (operator 2026-05-22) | Reuses `/welcome` post-submit. Decision language stays neutral (no rejection framing). |
| OD-3 | Score dispute process | Defer to P3 | No volume yet. Manual email to ops in the interim. |
| OD-4 | Partner SLA lead time (Gerald) | 21 days from event creation to publish | Soft warning in the event-creation form (P2). |
| OD-5 | Sponsor brief shareable externally? | Yes, watermarked, anonymized aggregates only (P2) | Gerald needs this for outreach. |
| OD-6 | Transactional email vendor | ✅ **Resend** (operator 2026-05-22) | Sender: `hello@festival.so` — DNS verified by operator. |
| OD-7 | Where does `/events/<slug>` live in the route tree? | Public, outside `(authed)` | Apply flow uses no Clerk on first visit. |
| OD-8 | Should existing `/welcome` self-discovery flow stay public? | Yes, unchanged | Now also serves as the event-application post-submit landing. |

---

## 9. Non-functional notes

- **Decision language**: the approved email surfaces the score positively ("You're in: Founder Dinner — June 2 · Your FounderScore: 137"). The denied / waitlist email avoids the score entirely AND avoids rejection language — it's framed as "we'll keep you in the loop for future events that match." Score visibility is on the applicant's `/welcome` page; the email subject and body never imply judgment of the applicant.
- **UX speed**: applicant submit → score visible on `/welcome` within ~10-20s (existing scoring latency; the EvalProgress UI is shown during the wait, same as the public splash flow today).
- **Audit**: every approve/deny/pending action is written to `event_decision_log` with timestamp + actor + reason. Bulk actions write one log row per affected applicant.
- **Scale**: P1 must handle 600+ applicants per event (Jackie's ask). The applicant queue paginates server-side (50/page); filters mutate URL params. No client-side virtual list needed at this size.

---

## 10. What this spec is NOT

- Not a redesign of the existing public funnel — `/`, `/welcome`, `/leaderboard`, `/verified`, `/claim` all stay as-is.
- Not a rebuild of the scoring engine — it's reused verbatim, with one additive column (`investorStageFocus`).
- Not a Luma integration — that's P3.
- Not a sponsor marketplace — only event-level sponsor block in P1; the brief generator is P2.
- Not multi-admin RBAC — the `ADMIN_EMAILS` allowlist is sufficient for P1.

---

## 11. Implementation note

This spec is intentionally lighter than a full implementation plan. Once approved, the next step is the **writing-plans** skill to produce a task-by-task plan with TDD checkpoints for the P1 scope. P2 and P3 each get their own plan documents when their phase is greenlit.

The fork point for implementation is `polish` → `events-v1` (new branch off `polish`'s tip).
