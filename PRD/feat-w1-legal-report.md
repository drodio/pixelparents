## Progress Update as of [June 30, 2026 — 6:03 AM Pacific]

### Summary of changes since last update
First entry on branch `feat/w1-legal-report` (off `main`). Added concise,
plain-language Privacy Policy + Terms of Service pages and a "Report a bug or
abuse" entry on the landing page. The report submits to a server action that
emails the admin via the app's existing Resend setup (no new DB table). All
validation gates pass (tsc, eslint, vitest) and a production build succeeds in
the main checkout.

### Detail of changes made:
- **NEW `app/privacy/page.tsx`** — short, skimmable Privacy Policy. Static page
  (prerendered). Friendly tone, dark/amber theme. States: free open-source
  community project for OHS families, NOT affiliated with/endorsed by Stanford
  (links `github.com/drodio/pixelparents`); collects only opt-in data; profiles
  visible only to verified OHS families; no selling/ad-sharing; data deletion on
  request; contact via `hello@pixelparents.org`. Includes the "plain-language
  summary, not legal advice" disclaimer.
- **NEW `app/terms/page.tsx`** — short Terms of Service, same theme/disclaimer.
  Covers: what it is (free volunteer project, not Stanford), be-a-good-neighbor
  conduct, user responsible for what they post, verified-families-only access,
  provided "as is" with no warranty + limited liability, can leave/delete
  anytime, contact path. Intentionally loose per founder direction — no scary
  clauses.
- **NEW `app/report/actions.ts`** — `submitReport` server action. Reuses the
  app's Resend config (`RESEND_API_KEY` / `RESEND_FROM`, same FROM fallback as
  `lib/email.ts`). Recipient is env-driven: `REPORT_TO` → `NOTIFY_TO` →
  `hello@pixelparents.org` placeholder (NO personal email hardcoded). Validates
  category (bug|abuse|other), message (5–4000 chars), optional contact email.
  Best-effort in-memory per-IP rate limit (3 / 10 min) via `x-forwarded-for`.
  Sets `replyTo` to the reporter's email when provided. Never throws to the user.
- **NEW `app/report/report-dialog.tsx`** — client component: a small amber
  "Report a bug or abuse" link in the landing footer that opens an accessible
  modal (role=dialog, aria-modal, Escape-to-close, focus management, backdrop
  click-to-close). Uses `useActionState`; shows a success state on send. On-theme.
- **EDIT `app/page.tsx`** — added a tasteful footer row BELOW the existing
  "Created with [heart] by … Become a student builder." line with the
  `<ReportDialog />` trigger + Privacy Policy + Terms of Service links
  (dot-separated, small/muted, amber accents).

### Potential concerns to address:
- The in-memory rate limit is per-instance only (not durable across serverless
  instances). Fine for a low-volume report endpoint; a durable limiter (KV/DB)
  is a later Trust & Safety wave, as is a full report→admin-queue table.
- `REPORT_TO` is not yet documented in `.env.example` (left untouched — out of
  this branch's file scope). Falls back gracefully to `NOTIFY_TO`. Consider
  adding it to `.env.example` in a follow-up.
- Pages use `hello@pixelparents.org` as the contact/deletion address — confirm
  that inbox is monitored, or swap to a dedicated alias.
