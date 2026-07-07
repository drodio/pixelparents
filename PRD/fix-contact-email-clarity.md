## Progress Update as of [July 7, 2026 — 4:24 PM Pacific]

### Summary of changes since last update
First entry. A parent emailed Daniel that he'd accidentally signed up with his
child's email as his own account email, so every Pixel Parents notification
(including a meeting invite) went to the child's inbox — and he had no way to
notice or fix it. Root gap: the signup/profile email is the IDENTITY KEY
(login + directory mapping), so it's deliberately read-only everywhere
(member-card marks it read-only; patchFamilyMember strips it) — meaning there is
NO self-serve way to correct a wrong contact email. Making it freely editable is
unsafe (changing the identity key without re-mapping the Clerk login would lock
the account out), so this PR ships the safe two-part fix: prevent the confusion at
signup + make a wrong address discoverable with a recovery path. tsc/lint/build
green.

### Detail of changes made:
- **`app/signup/signup-form.tsx`** — added a helper line under the parent "Email"
  field: "We send your invites and updates here — use YOUR OWN email, not your
  child's. (There's a separate spot for your student's email in the next step.)"
  Directly targets the exact mistake the parent described.
- **`app/(authed)/family/member-card.tsx`** — the read-only Email field now has
  visible helper copy explaining it's where ALL notifications go and that it's tied
  to the login, plus a "Contact us to fix it" link to `/report` (the app's contact
  surface) for the wrong-address case. Added the `next/link` import. This makes a
  wrong contact email both noticeable and recoverable without the unsafe raw edit.
- Deliberately did NOT make the email field editable or touch the identity mapping
  (`familyIdForEmail` maps Clerk login email → signups.email). A proper editable
  contact email needs to either separate "login identity" from "contact email" or
  coordinate a Clerk email change — a design decision, not a blind fix.

### Potential concerns to address:
- **The specific parent's email still needs an ADMIN correction** (change their
  signups.email from the child's address to their own, and make sure their Clerk
  login email matches so familyIdForEmail still resolves). That's an operator
  action — not done here.
- **Roadmap item surfaced:** the real fix is decoupling the notification/contact
  email from the login-identity email (or a verified, editable contact email). Until
  then, wrong-email correction is support-mediated.
- **Recovery path assumes `/report` tickets are actually monitored.** Ties directly
  to the meeting's "easy trouble-ticket + support 2.0" agenda item — worth making
  sure report submissions notify an admin.
