# Pixel Parents — Signup & Family Profile (design spec)

**Date:** 2026-06-15
**Branch:** `main`
**Status:** Approved design, pending implementation plan

## 1. Goal

A two-step onboarding flow for OHS (Stanford Online High School) parents:

1. **`/signup`** — recruit interested parents: required contact info + optional
   skills/availability profile (to find people who can help build software).
2. **`/signup/thanks?id=<uuid>`** — a personalized intro from DROdio + an
   *optional* family/child profile that becomes the project's initial seed data
   set (children, interests, family photos).

Plus: store everything in **Neon Postgres**, **email the NOTIFY_TO address** on each
signup, a **DROdio-only admin view**, and **bot protection** on the public form.

## 2. Tech additions

| Concern | Choice |
|---|---|
| Database | **Neon Postgres** via Vercel Marketplace (`DATABASE_URL`) |
| ORM / migrations | **Drizzle ORM** + `drizzle-kit` (schema + migrations in repo) |
| Validation | **Zod** schemas shared client + server |
| Bot protection | **Vercel BotID** (`checkBotId()` server-side + client) |
| Photo storage | **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`), client-upload flow |
| Image optimization | **Client-side** canvas resize (~1600px) + compress (~0.8 WebP/JPEG) before upload |
| Email | **Resend** (`RESEND_API_KEY`; user has an account) |
| Admin auth | **HTTP Basic Auth** in `middleware.ts` (`ADMIN_USER` / `ADMIN_PASSWORD`) |

## 3. Data model (Drizzle)

Family-level fields live on `signups` (1:1 with the parent); children are a
separate 1:N table so "add another child" only repeats child-level fields.

### `signups`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `created_at` | timestamptz | `now()` |
| `first_name` | text | **required** |
| `last_name` | text | **required** |
| `email` | text | **required** |
| `phone` | text | **required** |
| `ohs_affiliation` | text | optional, one of AFFILIATIONS |
| `technical_depth` | text | optional, one of TECH_DEPTH |
| `linkedin_url` | text | optional |
| `skillsets` | text[] | optional, multi-select |
| `time_commitment` | text | optional, one of TIME_COMMITMENT |
| `city` | text | optional (family-level, from step 2) |
| `state` | text | optional (family-level) |
| `parent_interests` | text[] | optional (family-level) |
| `photos` | jsonb | array of `{url, pathname, contentType, width, height}` |
| `extra` | jsonb | default `{}`, reserved for future questions |

### `children`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `signup_id` | uuid fk → signups.id | cascade delete |
| `created_at` | timestamptz | `now()` |
| `first_name` | text | |
| `grade` | text | one of GRADES (7th–11th) |
| `interests` | text[] | |
| `notes` | text | "what else should we know" |

### Interests suggestion pool
`SELECT DISTINCT` over `unnest(signups.parent_interests)` ∪
`unnest(children.interests)` → a single shared string[] used to render
selectable pills on both interest fields. New pills are free-form additions.

## 4. Option constants (single source of truth — `lib/options.ts`)

- **AFFILIATIONS:** New parent (child(ren) just starting at OHS) · Existing parent (currently enrolled) · Previous parent (graduated) · Alumni student (I graduated from OHS)
- **TECH_DEPTH:** Yegge or Linus Level · 10x Developer · Rusty, but good! · Junior Developer · Vibe coder · Future vibe coder (just curious)
- **SKILLSETS:** Backend · Frontend · Fullstack · Eng manager · DevOps · AI LLM Wrangler · Security · Analytics
- **TIME_COMMITMENT:** <1 hour/week · 1–2 hours/week · 2–5 hours/week · 5–10 hours/week · 10–20 hours/week · Full time or more!
- **GRADES:** 7th · 8th · 9th · 10th · 11th

## 5. Routes & files

```
app/signup/page.tsx              # server: renders SignupForm
app/signup/signup-form.tsx       # client: fields, BotID client, zod, calls action
app/signup/actions.ts            # server action: submitSignup
app/signup/thanks/page.tsx       # server: loads signup by id → greeting + intro + FamilyForm
app/signup/thanks/family-form.tsx# client: family + child fields, interest pills, photo upload, 3 buttons
app/signup/thanks/actions.ts     # server actions: saveFamily, addChild
app/admin/page.tsx               # server: list signups + children (Basic Auth via middleware)
app/api/blob/upload/route.ts     # Vercel Blob client-upload token handler
app/api/interests/route.ts       # GET distinct interests pool
middleware.ts                    # Basic Auth gate for /admin
lib/db/schema.ts                 # Drizzle schema
lib/db/index.ts                  # drizzle(neon) client
lib/options.ts                   # option constants (shared)
lib/validation.ts                # zod schemas built from options
lib/email.ts                     # Resend notification
lib/image.ts                     # client-side optimize util
drizzle.config.ts                # drizzle-kit config
lib/db/migrations/*              # generated SQL migrations
```

## 6. Flows

### Signup (`/signup`)
1. Client: zod validation + BotID client active.
2. `submitSignup(formData)`: `checkBotId()` → reject bots; zod parse; insert
   `signups` row; send Resend email (best-effort, wrapped in try/catch so email
   failure never blocks); `redirect('/signup/thanks?id=' + id)`.

### Thanks / family profile (`/signup/thanks?id=`)
1. Server loads signup by `id` for the `[FirstName], nice to meet you.` greeting
   + the static DROdio intro copy. Invalid/missing id → generic thank-you.
2. Intro includes a reference link to DROdio's own submission via
   `NEXT_PUBLIC_DRODIO_SUBMISSION_URL` (placeholder until he submits).
3. `FamilyForm`: family-level fields (city, state, parent interests, photos) +
   one child block (first name, grade, interests, notes).
4. Photos: each file is resized/compressed client-side, then uploaded directly
   to Vercel Blob via the client-upload token route; resulting URLs collected.
5. Buttons:
   - **Done** → `saveFamily` (upsert family fields on signup); `addChild` only
     if a child first name was entered (so "Done" with an empty child block saves
     just the family) → final confirmation state.
   - **Done + add another child** → save current child, keep family fields,
     reset child block for the next child.
   - **I'd rather skip this for now** → final confirmation, nothing saved.

### Admin (`/admin`)
- `middleware.ts` enforces Basic Auth (`ADMIN_USER`/`ADMIN_PASSWORD`); 401 +
  `WWW-Authenticate` when absent/wrong.
- Page lists signups newest-first with their children and key fields.

## 7. Email notification (`lib/email.ts`)
- Resend SDK. **To:** `NOTIFY_TO` (default `the NOTIFY_TO address`).
  **From:** `RESEND_FROM` (default `onboarding@resend.dev`; can move to a
  verified `pixelparents.org` sender later via Cloudflare DNS + `flarectl`).
- Subject: `New Pixel Parents signup: <First Last>`. Body: submitted fields.
- Best-effort; logged on failure, never blocks the user.

## 8. Environment variables
| var | source | committed? |
|---|---|---|
| `DATABASE_URL` | Neon (Vercel Marketplace) | no — `.env.local` + Vercel |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | no |
| `RESEND_API_KEY` | user's Resend account | no |
| `RESEND_FROM` | optional | no |
| `NOTIFY_TO` | `the NOTIFY_TO address` | no |
| `ADMIN_USER` / `ADMIN_PASSWORD` | chosen | no |
| `NEXT_PUBLIC_DRODIO_SUBMISSION_URL` | placeholder | may default in code |

All non-public secrets go in git-ignored `.env.local` and Vercel env; templates
added to `.env.example`. The pre-commit secret guard covers them.

## 9. Validation & error handling
- Required: first/last/email/phone. Email + LinkedIn URL format via zod.
- Server actions use `useActionState` to return field errors for inline display.
- Image optimize failures fall back to uploading the original (with a size cap).

## 10. Testing
- **Unit (Vitest):** zod schema accept/reject cases; interests-pool dedupe;
  image-optimize util (dimension math). Pure logic, no DB.
- **Integration:** exercised manually against a Neon branch / preview deploy;
  document the manual happy-path checklist in the plan.

## 11. Out of scope (now)
- OHS-family *authenticated* public viewing of answers (forward promise in copy).
- Family self-service editing of submitted data.
- Verified custom email sending domain.
- The concrete reference URL to DROdio's submission (placeholder until seeded).
- Phase-2/3 additional question sets beyond what's specified here.

## 12. Privacy note
Children's data (names, grades, interests, photos) is sensitive. v1 keeps it in
Neon behind a DROdio-only admin gate; no public exposure. The public copy's
"only authenticated OHS families will see your answers" is honored by *not*
building any public viewing until proper identity + OHS verification exists.
