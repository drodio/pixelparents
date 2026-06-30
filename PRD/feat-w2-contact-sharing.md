## Progress Update as of [June 30, 2026 — 6:17 AM Pacific]

### Summary of changes since last update
First entry for this branch. Built the "You're connected" system on the Community
board: when a post author accepts a response, the mutual accept is treated as
double-opt-in consent to connect — both parties get (1) an in-app connected card
revealing the OTHER person's share-honored contact, and (2) a warm double-intro
email. Minors are routed through a parent and their raw contact is never exposed.

### Detail of changes made:
- NEW `lib/intro.ts` — the pure reveal/derivation core (unit-tested):
  - `deriveConnectionParty(person, familyParents)` → reveal-safe `ConnectionParty`
    (name, isStudent, viaParentName, contact `methods[]`, fallback `messageHint`).
    Honors the existing share model via `shareFieldsOrDefault` + `hasShareableProfile`
    (email behind "email", phone behind "phone", LinkedIn/GitHub/website behind the
    default-OFF "links" field; the OHS-gated /p profile link always rides along).
  - MINOR RULE (paramount): a student account's email/phone/links are NEVER read.
    We find a guardian in the same family and surface the GUARDIAN's shared contact,
    labelled "reach <Student> through their parent <Parent>". No reachable guardian
    contact → empty methods + a hint, never the student's PII.
  - `buildIntroEmail(...)` — double-opt-in etiquette: `Intro: A <> B — <topic>`
    subject, why-connected context, each side's shared contact, post link, soft
    opt-out nudge. `displayNameOf` + `contactLinesFor` helpers.
- `lib/email.ts` — added `sendConnectionIntro({subject,text,recipients})`: thin
  delivery wrapper over the existing best-effort `sendEmail`/Resend setup (dedupes
  + drops blank recipients). No contact derivation here — it only delivers what
  `buildIntroEmail` composed.
- `app/(authed)/community/actions.ts` — `decideResponseAction`: on ACCEPT, fires
  the intro email in the background via `after()` (never blocks/fails the accept).
  `sendConnectionIntroForResponse` reloads the response/ask/both signup rows + each
  family's parents from the DB (never client-trusted), derives both parties, sends
  to each person's account email, and CCs a routed minor's guardian(s).
- `app/(authed)/community/[id]/connected-card.tsx` — NEW client component: the
  "You're connected with X" panel — gradient emerald card, copy-to-clipboard
  contact rows, the "connecting over <topic · format>" context, a sky "route
  through parent" banner for minors, and the no-contact hint fallback.
- `app/(authed)/community/[id]/page.tsx` — replaced the bare accepted-response
  "view profile" stub with the new `ConnectedCard`. For each accepted response it
  pre-derives both parties server-side (one batched family-rows query), and shows
  the OTHER party to whoever's viewing (author sees responder; responder sees
  author). Viewer only ever sees a card when they're a party to that accept.

### Validation
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npx vitest run` → 358 passed (31 files), incl. NEW `lib/intro.test.ts` (17
  cases) covering the share gates AND that a minor's raw email/phone/token never
  appears in any method, line, or email body — even if the student opted to share.
- `npm run build` fails in the worktree on the node_modules symlink (known Turbopack
  limitation, not our code); verified GREEN by copying changed files into the main
  checkout, building, then restoring main to clean.

### Research-informed design choices
- Double opt-in: responder opts in by responding, author by accepting → no extra
  confirm needed; the accept IS consent (CB Insights / beehiiv intro etiquette).
- Intro email format follows the canonical "A <> B — topic" subject + forwardable
  context + each side's contact + soft opt-out, applied to a peer community.
- Reveal only what each person opted to share; lead with the post topic so the
  connected moment carries WHY ("connecting over …").

### Potential concerns to address:
- `after()` runs the email post-response; if Resend is unconfigured locally the
  send is a best-effort no-op (logged) — the in-app card still works regardless.
- The connected card is shown for ALL accepted responses (author can have several
  accepts on one Offer); each is its own connection. Intended.
- Could add an optional pre-send confirm step later; current flow keeps accept
  one-click and reveals/intros immediately, which reads as a satisfying moment.
