# Admin RBAC — design spec

Date: 2026-05-26
Branch: `events-v1`
Status: approved (design); Phase 1 to be planned + built next.

## Problem

`/admin` access today is a single flat check: an email on the `ADMIN_EMAILS`
env allowlist (matched against the signed-in user's *verified* emails). Two
gaps:

1. **No self-service entry.** A non-admin hitting `/admin` is redirected to `/`
   with no way to sign in there or ask for access. We want a sign-in-from-`/admin`
   flow (no profile claim required, like `/developers`) and a "Request Admin
   Status" button.
2. **No tiers or delegation.** Admin is all-or-nothing and env-only, so it can't
   be granted at runtime, and every admin sees everything. We want a super-admin
   tier, runtime-grantable admin access, and named roles that scope what an admin
   can see and do.

## Tiers

1. **Super admin** — a hardcoded constant in code:
   `SUPER_ADMIN_EMAILS = ["drodio@chief.bot", "drodio@gmail.com", "drodio@storytell.ai"]`.
   Changing the set requires a code change + PR (deliberately NOT env, because
   env can change without a PR). Super admins bypass every grant/scope check and
   always see `/admin/users` and `/admin/roles`.
2. **Admin** — DB-backed (`admin_access` table), approved through `/admin/users`.
   In Phase 2 each admin carries a **role** (one scope + a set of grants) that
   determines what they see and do.
3. **Everyone else** — any signed-in user can request admin via `/admin`.

### Relationship to the existing `ADMIN_EMAILS` env

`drodio@storytell.ai` is now a **super admin** (see the constant above), so the
operator's festival login has full super-admin access on localhost and prod.

`ADMIN_EMAILS` env is retained as **bootstrap full-admins** so any other emails
listed there don't break — they remain full admins but are **not** super admins
(no `/admin/users`, no `/admin/roles`).

Testing implications (localhost):
- Super-admin features → sign in as `drodio@storytell.ai` (the festival login),
  `drodio@gmail.com`, or `drodio@chief.bot`.
- Request flow → sign in as any other (non-admin) account, click Request.

## Authorization model

Effective capability of the signed-in user is resolved (server-side) as:

- **super admin** if a *verified* email ∈ `SUPER_ADMIN_EMAILS` → all grants, all
  scope, all pages.
- else **bootstrap admin** if a *verified* email ∈ `ADMIN_EMAILS` env → treated
  as full admin (all grants, `edit_all` scope), but not super-admin pages.
- else **role admin** if an `approved` `admin_access` row exists for this
  `clerkUserId` → capabilities come from the assigned role (Phase 2). In Phase 1
  (no roles yet) an approved row = full admin.
- else **not an admin**.

`isAdmin()` returns true for any of the first three. New helpers expose the
finer-grained checks (`isSuperAdmin()`, `can(grant)`, `scopeOf()`).

All checks use **verified** emails only (same anti-spoofing rule as today). DB
grants are keyed on `clerkUserId` (the authenticated identity), which cannot be
spoofed.

## Data model

### `admin_access` (Phase 1; `roleId` used in Phase 2)

| column            | type        | notes                                           |
|-------------------|-------------|-------------------------------------------------|
| `id`              | uuid pk     |                                                 |
| `clerkUserId`     | text unique | identity the grant is keyed to                  |
| `email`          | text        | snapshot for display in the requests list       |
| `name`            | text        | snapshot for display                            |
| `imageUrl`        | text        | snapshot avatar for display                     |
| `status`          | text        | `pending` \| `approved` \| `denied`             |
| `roleId`          | uuid null   | FK → `admin_roles.id`; null in Phase 1          |
| `requestedAt`     | timestamptz | default now                                     |
| `decidedAt`       | timestamptz | null until approved/denied                      |
| `decidedByEmail`  | text        | which admin decided (audit)                     |

Deny is reversible: a denied user sees "request declined" and may request again,
which flips the row back to `pending` (and clears `decidedAt`/`decidedByEmail`).

### `admin_roles` (Phase 2)

| column      | type        | notes                                               |
|-------------|-------------|-----------------------------------------------------|
| `id`        | uuid pk     |                                                     |
| `name`      | text unique | e.g. "Vendor"                                        |
| `scope`     | text        | `view_theirs` \| `edit_theirs` \| `view_all` \| `edit_all` |
| `grants`    | jsonb       | array of grant keys (string[])                      |
| `createdAt` | timestamptz | default now                                         |
| `updatedAt` | timestamptz | default now                                         |

### Grant keys (constants in code, Phase 2)

| key                      | label                              | gates                                  |
|--------------------------|------------------------------------|----------------------------------------|
| `run_scoring_jobs`       | can run jobs to score users        | New job / Re-Run All / rerun controls  |
| `create_events`          | can create events                  | "+ New event"                          |
| `manage_events`          | can manage events                  | edit event + registration              |
| `delete_events`          | can delete events                  | delete event                           |
| `create_roles`           | can create roles                   | `/admin/roles` create                  |
| `edit_roles`             | can edit roles                     | `/admin/roles` edit/delete             |
| `approve_admin_requests` | can approve/deny admin requests    | `/admin/users` decisions               |

### Scope semantics (Phase 2)

One value per role, encoding (read|write) × (own|all):

- `view_theirs` — read-only, only items the admin created
- `edit_theirs` — read + write, only items the admin created
- `view_all`    — read-only, all items
- `edit_all`    — read + write, all items

Applies uniformly to the three resources selected: **events**, **scoring jobs**,
**scored profiles**. "Theirs" requires creator attribution per resource (see
Open Questions).

## UX / pages

### `admin/layout.tsx` — the gate (Phase 1)

Replaces the current `redirect("/")`. Resolves the viewer's capability and:
- **signed out** → renders `<AdminAccessGate>` sign-in screen: Founder Festival
  logo + a **Sign in** button calling `clerk.openSignIn({ forceRedirectUrl:
  "/admin", signUpForceRedirectUrl: "/admin" })` (no profile claim, mirrors
  `/developers`).
- **signed in, not an admin** → `<AdminAccessGate>` request screen: "Signed in as
  `<email>`" + **Request Admin Status** button; shows "Request pending" once a
  pending row exists, or "Request declined — request again" if denied.
- **admin / super-admin** → renders children (normal admin UI) with the header
  nav. Nav shows `/admin/users` and `/admin/roles` only when the viewer can see
  them.

### `/admin` hub

Unchanged two-box hub (Bulk Score / Manage Events). (Box styling already updated:
centered, taller, gold centered Enter buttons, 40px padding.) The admin-requests
list does NOT live here — it lives on `/admin/users`.

### `/admin/users` (Phase 1: super-admin-only; Phase 2: gated by `approve_admin_requests`)

- Lists `admin_access` rows grouped/sorted by status (pending first).
- Each pending row: requester name + email + avatar, **Approve** / **Deny**.
- Phase 2: approve includes a **role dropdown** (assign-at-approval); approved
  rows show their current role with the ability to change it.

### `/admin/roles` (Phase 2: gated by `create_roles`/`edit_roles`; super-admin always)

- Table of roles (name, scope, grant chips) with create / edit / delete.
- Role editor: name input, scope radio (4 options), grants multi-select checklist.

## API routes (all admin-gated server-side)

Phase 1:
- `POST /api/admin/access/request` — any signed-in user; upserts *their own*
  `admin_access` row to `pending` (keyed by `clerkUserId`). Not super-admin-gated
  (it only ever touches the caller's own row), but rejects if caller is already
  an admin (no-op) and requires a signed-in session.
- `POST /api/admin/access/[id]/decision` — body `{ decision: "approved" |
  "denied" }`. Gated: super-admin (Phase 1) → super-admin OR `approve_admin_requests`
  grant (Phase 2). Sets `status`, `decidedAt`, `decidedByEmail`; Phase 2 also sets
  `roleId` from the body.

Phase 2:
- `POST /api/admin/roles` — create role (gated `create_roles`).
- `PATCH /api/admin/roles/[id]` — edit role (gated `edit_roles`).
- `DELETE /api/admin/roles/[id]` — delete role (gated `edit_roles`). Deleting a
  role in use: block with a clear error (or null out assignees — decided in Phase
  2 planning).

## Defaults / decisions

- **Single concept of "approved" admin** in Phase 1 = full admin. Roles layer on
  in Phase 2.
- **Deny is reversible** (re-request allowed).
- **No email notifications** — in-app only.
- **Phase-2 migration** seeds a default "Full access" role (`edit_all`, all
  grants) and assigns it to every Phase-1 approved admin so none lose access when
  role-gating turns on.

## Migrations

- Phase 1: additive `admin_access` table → new drizzle migration.
- Phase 2: additive `admin_roles` table + `admin_access.role_id` FK + creator
  attribution columns on `events` / `scoring_jobs` (+ evaluations approach TBD).
- Production has no auto-migrate on deploy (project memory); the operator runs
  migrations on prod when ready. All changes here are additive and safe.

## Open questions — RESOLVED (2026-05-26)

1. **Scope attribution for scored profiles.** RESOLVED: scope (theirs/all) applies
   only to **events** and **scoring jobs** (by creator). **Scored profiles are NOT
   ownership-scoped** — they're controlled by a grant (all-or-nothing), since a
   scored person has no meaningful "owner". (Decided to avoid forcing an artificial
   owner onto evaluations.)
2. **Role-in-use deletion** RESOLVED: **block** — refuse to delete a role assigned
   to ≥1 admin; the super-admin must reassign them first.

## Phasing of Phase 2 (decided 2026-05-26)

- **Phase 2a (grants RBAC) — built first:** `admin_roles` table + `admin_access.role_id`,
  the 7 grant keys, `/admin/roles` CRUD (name + grants), assign-role-at-approval on
  `/admin/access`, a `can(grant)` capability resolver, and grant-gating of every
  admin action (scoring jobs, event create/manage/delete, role CRUD, approve
  requests) — server-side + UI. The `scope` column exists (default `edit_all`) but
  is NOT yet editable or enforced.
- **Phase 2b (scope) — follow-up:** `created_by` columns on events + scoring_jobs,
  the scope selector in the role editor, and view/edit theirs-vs-all enforcement.

Note: the grant `approve_admin_requests` gates **`/admin/access`** (the page was
renamed from `/admin/users`, which main reused for "Profiles scored" → `/admin/profiles`).

## Testing strategy

- Unit: capability resolver (`isAdmin`, `isSuperAdmin`, `can`, `scopeOf`) across
  super-admin / bootstrap / approved-role / pending / denied / signed-out.
- API: `request` (creates own pending row, re-request from denied, rejects when
  already admin), `decision` (approve/deny, auth 403 for non-authorized).
- Phase 2: role CRUD auth + grant gating + scope filtering.

## Out of scope

- Email/Slack notifications on new requests.
- Granular per-event ACLs beyond the role scope.
- Self-service role assignment by non-super-admins beyond the defined grants.
