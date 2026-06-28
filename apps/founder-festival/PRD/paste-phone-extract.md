# Branch: `paste-phone-extract` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
Pasted-text rows now extract an inline PHONE number (like they already do email),
so a line like "Daniel Odio, drodio@gmail.com, +16502747647" captures the phone
into the pipeline → evaluations.phone → the /account verify-this-number prompt.
Previously only CSV columns captured phone; pasted phones were dropped.

### Detail
- `parse-paste-input.ts`: PHONE_RE (leading-+ intl OR NANP 3-3-4) + normalizePhone
  (→ E.164-ish; bare 10-digit → +1). Email+phone stripped from the line; both
  attached via a shared `enrich` spread. 16 tests; tsc+eslint clean.

### Note
Matching still keys on linkedin_url / exact lower(full_name) — a pasted "Daniel
Odio" won't match an existing "Daniel R. Odio" (creates a new profile). To enrich
a specific existing profile, paste its LinkedIn URL (or exact name) with the phone.
