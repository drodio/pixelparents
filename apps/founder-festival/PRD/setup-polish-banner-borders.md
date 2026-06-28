# Branch: `setup-polish-banner-borders` — progress log

Branched from `main` (post PR #42).

## Progress Update as of 2026-05-26 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
- Reverification hint copy trimmed to: "For security, you may first
  need to re-auth via email to confirm your identity."
- CHANGE button moved from inline-next-to-email into the card header
  (top-right next to "Email" / "Text" title). Frees up horizontal
  space so the email address doesn't wrap mid-word inside the card.
- New `Card` `state` prop drives the border color:
    verified → emerald-600 (green) — done
    active   → #dfa43a (gold)      — the next step the user needs
    neutral  → zinc-800             — idle
  Email becomes "active" first; once verified the Phone card becomes
  active. Both verified = both green.
- `<EmailCard>` now supports adding ADDITIONAL emails:
    - "+ Add another" button below the primary
    - Add flow leaves the new address as a secondary verified email
      (doesn't promote to primary or destroy the previous)
    - CHANGE flow still swaps the primary as before
  Extra verified emails render under the primary in the card.
- PreferencesTable header is grayed (`text-zinc-500`) when the table
  is disabled. The "Verify your phone…" inline notice was removed;
  hover on a disabled toggle now surfaces a native tooltip
  ("Verify your email + phone to enable selections.") instead.
- Bottom CTA button text: "Continue" → "Finalize Membership".

### Files touched
- `src/components/AccountSetupForm.tsx`:
  - New `EmailMode = CardMode | "addAnother"`.
  - New `CardState = "neutral" | "active" | "verified"`.
  - `Card` accepts `state` + `action` (header-right slot).
  - `HeaderChangeButton` helper for the in-header CHANGE control.
  - `CurrentValueRow` simplified — no longer renders the CHANGE
    button itself (now in the card header).
  - `EmailCard` + `PhoneCard` accept `state` prop and pass it to
    `<Card>`. Parent `AccountSetupForm` computes `emailState` /
    `phoneState` from `user.primary{Email,PhoneNumber}Address`.
  - `EmailCard` extras list + "+ Add another" button.
  - `PreferencesTable` no longer takes `hasEmail` / `hasPhone`
    (no inline notice); only `enabled`. Header text grays out.
  - `Toggle` adds a native `title=` tooltip explaining why it's
    disabled.
