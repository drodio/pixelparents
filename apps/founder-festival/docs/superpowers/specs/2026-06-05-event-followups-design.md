# Event Followups — Master PRD / Design

**Status:** Draft for review
**Date:** 2026-06-05
**Branch:** `worktree-event-followups`
**Author:** DROdio + Claude

---

## 1. Vision

Turn each Founder Festival event into a rich, living page. Anonymous visitors see a
public recap (photos, host/sponsor info, aggregate analytics). Attendees who RSVP'd
"yes" on Luma **and** claimed their Founder Festival profile unlock a private layer:
attendee-only learnings, attendee-only photos, a directory of fellow attendees, and a
consent-based "Connect" flow. Admins get tooling to manage all of it — attendance,
photos, learnings, hosts, sponsors, and event priorities.

We just ran three events (June 1, 2, 3 2026); this feature makes them — and every
future event — into durable, shareable artifacts and a relationship-building engine.

---

## 2. What we build on (existing system)

- **Events are live**: `events` + `event_applicants` tables, Luma *calendar* sync
  (`src/lib/luma.ts`, `src/lib/luma-sync.ts`), public `/events/[slug]` apply pages
  (`src/app/events/[slug]/`), admin event CRUD under `(authed)/admin/events` gated by
  RBAC grants (`create_events`, `manage_events`, `delete_events`) via `src/lib/grants.ts`.
- **Profiles** = the `evaluations` table (PK `id`, unique `linkedinUrl`, has `email`;
  alternate emails in `profile_emails`). Claimed profiles link via `users.evaluationId`
  (`clerkUserId`).
- **Scoring**: `evaluations.founderScore` / `investorScore`; role = higher of the two
  (ties → founder), per `src/lib/profile-slug.ts`.
- **Spider/radar**: `src/components/CredibilityRadar.tsx` + `src/lib/credibility*.ts`.
  Founder axes: technical/traction/operator/domain/gtm. Investor axes:
  portfolio/outcomes/firm/experience/capital. `rawVectorPoints()` gives raw per-axis
  points from a breakdown; a 5-min population cache backs percentile scoring.
- **Priorities/categories**: existing recommendation model with categories
  (fundraising, hiring, intros, tactical, positioning, wellbeing) —
  `src/components/Recommendations.tsx`, `recommendations` jsonb on evaluations.
- **Mutations**: API routes under `/api/admin/*` (no Server Actions). Drizzle over
  Neon-HTTP; multi-statement atomicity via `db.batch([...])` (no `db.transaction`).
- **UI**: Tailwind v4, custom components (no shadcn), dark theme + gold `#dfa43a`.
  Public routes deliberately stay out of the `(authed)` group so anonymous visitors
  never load Clerk.

### Gaps we must build from scratch
- **Image upload** — none today (only external `coverUrl` strings). → Vercel Blob.
- **Rich-text editor** — none installed. → TipTap (stores HTML).
- **Per-person Luma guest/RSVP data** — current sync ignores it (calendar only).

---

## 3. Key technical finding (de-risks everything)

The Luma public API `GET /public/v1/event/get-guests?event_api_id=…` works with our
existing `LUMA_API_KEY` (verified live against all three June events). Per guest it
returns:

- `approval_status` — `approved` / `pending` / `declined` (this is the RSVP status)
- `email`, `name`, `user_first_name`, `user_last_name` — **email is the join key to
  our `evaluations` profiles** (direct or via `profile_emails`)
- `checked_in_at` — Luma's check-in timestamp (null on our June events since QR codes
  weren't scanned, so "did they show up" is blank as expected — but auto-fills if ever
  scanned)
- `registered_at`, `invited_at`, `joined_at`, `user_api_id` (stable Luma person id),
  `phone_number`, `event_tickets`

This single endpoint is the backbone of attendance tracking, RSVP gating, analytics,
the attendee directory, and the Connect flow.

---

## 4. Data model

New tables and the columns added to `events`. (Drizzle: snake_case columns, camelCase
TS, uuid PKs, `timestamp(..., { withTimezone: true })`, FKs cascade on event delete.)

### `events` (additions)
| column | type | notes |
|---|---|---|
| `learnings_public` | text | TipTap HTML, shown to everyone on recap |
| `learnings_attendees` | text | TipTap HTML, shown only to gated attendees |

> Hosts are **not** a column on `events` — see `event_hosts` (many-to-many).

### Phase 0 — `event_attendees`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `event_id` | uuid FK→events | cascade delete |
| `evaluation_id` | uuid FK→evaluations | **nullable** (null = Luma guest w/ no FF profile) |
| `luma_guest_api_id` | text | Luma `gst-…`; unique with `event_id` |
| `luma_user_api_id` | text | Luma `usr-…` |
| `email` | text | match key (lowercased) |
| `name` | text | |
| `approval_status` | text | `approved` / `pending` / `declined` |
| `registered_at` | timestamptz | from Luma |
| `checked_in_at` | timestamptz | nullable, from Luma |
| `luma_url` | text | event public URL |
| `created_at`/`updated_at` | timestamptz | |

Unique index `(event_id, luma_guest_api_id)` for idempotent upsert.

### Phase 1 — `event_photos`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `event_id` | uuid FK→events | cascade |
| `blob_url` | text | Vercel Blob URL |
| `source` | text | `admin` / `attendee` / `luma_cover` |
| `uploaded_by_evaluation_id` | uuid FK→evaluations | nullable (admin uploads = null) |
| `visibility` | text | `public` / `attendees` |
| `caption` | text | nullable |
| `sort_order` | integer | admin drag-reorder |
| `created_at` | timestamptz | |

### Phase 3 — Hosts
**`hosts`**: `id` · `name` · `blurb` (text) · `icon_url` (Blob) · `url` (click-out) ·
timestamps.
**`event_hosts`** (many-to-many): `id` · `event_id` FK→events · `host_id` FK→hosts ·
`sort_order` · unique `(event_id, host_id)`.
**`host_profiles`** (host↔profile, wired up later): `id` · `host_id` · `evaluation_id`
· unique `(host_id, evaluation_id)`.

### Phase 4 — Sponsors
**`sponsors`**: `id` · `name` · `blurb` · `logo_url` (Blob) · `website_url` · timestamps.
**`event_sponsors`**: `id` · `event_id` · `sponsor_id` · `sort_order` · unique pair.
**`sponsor_profiles`**: `id` · `sponsor_id` · `evaluation_id` · unique pair.

### Phase 5 — Event priorities
**`event_priorities`**: `id` · `event_id` FK→events · `text` · `category` (enum mirrors
recommendation categories) · `sort_order` · `created_at`. (Matching to founder
priorities is future work; we only define + store here.)

### Phase 6 — Attendee experience
**`connection_requests`**: `id` · `event_id` · `from_evaluation_id` · `to_evaluation_id`
· `status` (`pending`/`approved`/`denied`) · `token` (random, for email links) ·
`created_at` · `decided_at`. Unique `(event_id, from_evaluation_id, to_evaluation_id)`.
**`connection_preferences`**: `id` · `evaluation_id` · `scope` (`global` or an event id) ·
`group` (`founder`/`investor`/`sponsor`) · `action` (`auto_approve`/`auto_deny`/`ask`) ·
`updated_at`. Unique `(evaluation_id, scope, group)`.
**`event_contact_sharing`**: `id` · `event_id` · `evaluation_id` · `mode`
(`open_to_all` / `by_request`) · `updated_at`. Unique pair. (Per-attendee, per-event:
am I openly listed to fellow attendees, or do they have to request?)

---

## 5. Cross-cutting decisions

- **Images** → Vercel Blob. Admin uploads (Phase 1), attendee uploads (Phase 6). Every
  photo has a `public`/`attendees` visibility flag honored at render time by viewer
  gate. The Luma cover seeds the carousel as a `luma_cover` row (always public).
- **Rich text** → TipTap, persisted as sanitized HTML. Two fields: public + attendees.
- **Attendee gate** = viewer has a claimed FF profile (`users.evaluationId`) whose
  email matches an `event_attendees` row for this event with `approval_status =
  'approved'`. Helper: `isEventAttendee(eventId, viewer)`.
- **Spider averaging** → for a cohort (founder or investor attendees with FF profiles):
  sum each profile's `rawVectorPoints(breakdown)` per axis ÷ cohort size, then
  percentile vs the existing population cache. Render with `CredibilityRadar`.
- **Past vs upcoming** → "past" = `endsAt < now`. Public `/events` lists **past events
  to everyone**; **upcoming/qualified events to claimed users** (qualification logic is
  a later build — placeholder section now). A single `/events/[slug]` page renders the
  apply flow while upcoming and the recap once past.
- **RBAC** → reuse grant pattern. New grants as needed: `manage_event_content`
  (photos/learnings), `manage_hosts`, `manage_sponsors`, `manage_event_priorities` —
  or fold into existing `manage_events` to start (decision: start folded, split later
  if the team grows). Public pages bypass Clerk entirely.
- **Sync trigger** → extend the existing admin "Sync from Luma" action to also pull
  guests per event. Cron automation is a later add (crons are prod-only here).

---

## 6. Phases

Each phase is independently shippable (its own implementation plan → PRs). Build order:
**0 → 1 → 2 → 3 → 4 → 5 → 6.** Phase 0 unblocks 2 and 6; 1/3/4/5 are largely
independent and could parallelize after 0.

### Phase 0 — Attendance foundation
**Goal:** every event knows who registered, their RSVP status, and (if scanned) check-in.
- Add `get-guests` to `src/lib/luma.ts` (paginated, typed).
- `event_attendees` table + migration.
- Sync routine: for each Luma-sourced event, fetch guests, upsert by
  `(event_id, luma_guest_api_id)`, match `evaluation_id` by lowercased email
  (evaluations.email then profile_emails). Wire into the existing admin Luma sync.
- Admin: per-event attendee count + "matched to profile" count; manual re-sync button.
- **Acceptance:** running sync on the 3 June events populates `event_attendees` with
  correct RSVP statuses; matched profiles linked by email; idempotent on re-run.

### Phase 1 — Public recap pages
**Goal:** rich public event page + admin content tools.
- `/events` public index: past events (all viewers); placeholder upcoming section
  (claimed users) noting future qualification logic.
- `/events/[slug]` recap when past: Luma info, **photo carousel**, **public learnings**.
- Vercel Blob upload infra; admin photo manager (upload, caption, reorder, delete,
  set `public`/`attendees` visibility). Carousel filters by viewer gate.
- TipTap editor in admin for `learnings_public` (and `learnings_attendees`, surfaced in
  Phase 6).
- **Acceptance:** anonymous user sees past event with carousel (public photos only) +
  public learnings; admin can manage photos + learnings.

### Phase 2 — Public analytics
**Goal:** aggregate stats on the recap page (public to all).
- Avg founder score, avg investor score (over attendees with FF profiles + scores).
- Founder count, investor count, founder:investor ratio, total attendees.
- Two averaged spider graphs (founder cohort, investor cohort).
- **Acceptance:** numbers reconcile with `event_attendees` × scoring; spider graphs
  render averaged cohorts; visible to anonymous users.

### Phase 3 — Hosts
**Goal:** hosts as reusable entities with cross-event stats.
- `hosts` + `event_hosts` (many-to-many) + `host_profiles` (later wiring) + migration.
- Admin: hosts CRUD (name, blurb, icon upload, click-out URL), assign hosts to events.
- Public recap: host icons (click out via `url`) + blurb.
- Host aggregate stats: avg founder/investor score across all attendees of all the
  host's events.
- Seed: District (Jun 1 & 3), Agate Hound (Jun 2).
- **Acceptance:** an event shows multiple hosts; host stats aggregate across their events.

### Phase 4 — Sponsors
**Goal:** sponsors with event + profile associations.
- `sponsors` + `event_sponsors` + `sponsor_profiles` + migration.
- Admin: sponsors CRUD (name, blurb, logo, website), assign events, attach profiles.
- Public recap: sponsor section with logos; attached profiles listed under each sponsor.
- **Acceptance:** admin manages sponsors + associations; public page renders them.

### Phase 5 — Event priorities
**Goal:** define per-event priorities + categories (to later match founder priorities).
- `event_priorities` + migration; admin UI mirroring the recommendation-category model.
- **Acceptance:** admin defines/edits/reorders categorized priorities per event; stored
  for future matching. (Matching engine is explicitly out of scope here.)

### Phase 6 — Attendee experience
**Goal:** the RSVP+claimed private layer.
- Gate unlocks: **attendee-only learnings**, **attendee-only photos**, **attendee
  upload** (with public/attendees visibility choice).
- **Contact sharing**: per-event mode `open_to_all` vs `by_request`
  (`event_contact_sharing`).
- **Attendee directory**: list everyone who RSVP'd `approved`; "Connect" button per
  person (when not already open/connected).
- **Connection requests**: creating one emails the target with approve/deny links
  (tokenized). The email also offers bulk actions: approve/deny all future from
  **founders / investors / sponsors** for **this event** and **globally**
  (`connection_preferences`). On approve, contact info (email + LinkedIn) is exchanged.
- **Preference surfaces**: the email (tokenized one-click), the profile page (global
  prefs), and the event page (event-specific prefs).
- `auto_approve`/`auto_deny` short-circuit the request; `ask` falls back to the email.
- **Acceptance:** gated content hidden from non-attendees; Connect emails send;
  approve/deny works from email + profile + event page; group/scope prefs honored.

---

## 7. Assumptions & defaults (please correct in review)

1. "Attendee" / "RSVP'd yes" = Luma `approval_status = 'approved'`. `pending`/`declined`
   are stored but excluded from analytics, directory, and gating.
2. Luma guests with no matching FF profile are still stored (email only); they don't
   appear in profile-based analytics or the attendee directory.
3. Contact info exchanged on connect = email + LinkedIn URL (not phone).
4. The attendee directory is visible to all gated attendees regardless of a person's
   `open_to_all`/`by_request` mode; the mode only governs whether contact info is shown
   directly vs. gated behind a Connect request.
5. RBAC: start with the existing `manage_events` grant for all new admin tooling; split
   into finer grants later if needed.
6. Analytics aggregate only over attendees who have an FF profile **with a score**.
7. Learnings stored as sanitized TipTap HTML.

---

## 8. Out of scope (now)

- Event-priority ↔ founder-priority **matching engine** (we only define/store priorities).
- Upcoming-event **qualification logic** for claimed users (placeholder only).
- Cron automation of guest sync (manual admin trigger first).
- Wiring `host_profiles` associations into UI (table exists; UI later).
- Light mode / non-dark theming.

---

## 9. Open questions

- None blocking. Defaults in §7 govern unless changed in review.
