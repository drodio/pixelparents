# Design spec: PII / sensitive-data leak gate for the public repo

**Status:** proposed (for review — not yet built)
**Date:** 2026-06-17
**Context:** `pixelparents` is a **public** open-source repo backed by a private
Neon Postgres DB containing signups (parents + children: names, emails, phones,
GitHub usernames, locations, photos). We want to prevent personal/sensitive data
— especially anything that exists in the DB — from being committed to or
deployed from the public repo, with a manual override when a match is a false
positive.

## Goals

1. **Block obvious PII at commit time** (fast, local, no DB) — emails, phone
   numbers, private keys/secrets (existing secret guard).
2. **Block DB-sourced PII at merge time** (the real ask) — cross-reference the
   PR's changes against live DB values; fail a required check so the merge (and
   therefore the Vercel production deploy) is blocked until resolved or
   explicitly overridden.
3. **Never leak the protected data while protecting it** — the checks run in a
   public repo, so logs/output must not echo the matched value.

## Layered architecture

### Layer 1 — static pre-commit guard (DONE, this PR)
`.githooks/pre-commit` already blocks secrets; this PR adds:
- **Phone numbers** (tight grouping so versions/dates/IDs don't false-positive).
- **Email addresses** (allowlisted: the public CTA address, `*@example.com`,
  vendor/`no-reply@` addresses are permitted).
- Local, instant, no DB or network. Bypass: `git commit --no-verify`.

### Layer 2 — DB-aware PR gate (TO BUILD)
A GitHub Actions workflow (`.github/workflows/pii-gate.yml`) that runs on every
PR targeting `main`:

1. **Connect read-only to Neon** using `DATABASE_URL` stored as an encrypted
   GitHub Actions **secret** (ideally a read-only DB role).
2. **Build a match set** of full sensitive values from the DB:
   - emails, phone numbers (normalized: strip spaces/dashes/`+`), GitHub
     usernames, and full `First Last` name strings from `signups` + `children`.
3. **Scan the PR diff** (added lines) — and optionally the full working tree —
   for **exact** occurrences of any match-set value.
4. **On a hit:** exit non-zero → the **required status check fails** → branch
   protection blocks the merge → no deploy. Report **`file:line` + a redacted
   marker only** (e.g. `email match (sha256:ab12…)`), never the raw value.
5. **Manual override:** re-running passes when an admin applies a
   `pii-reviewed` label (the job treats the label as an ack and exits 0), or an
   admin uses their merge-bypass. Either way the override is recorded on the PR.

### Layer 3 — optional hardening (later)
- Scheduled full-tree + full-history scan (catches anything that slipped in).
- Vercel deployment check as a second gate.

## Matching strategy — the hard part

- **Match full values, never fragments.** The identity token `drodio` is the
  GitHub org, Vercel team, repo URL, and git author — it appears in thousands of
  legitimate places. Matching it is unusable. We match the **whole** email,
  **whole** phone, **whole** name string. (Example: a full address like
  `someone@example.com` matches precisely; a bare username does not.)
- **Phones:** normalize both sides (remove ` `, `-`, `.`, `(`, `)`, leading
  `+1`) and compare digit-runs of length ≥ 10.
- **Names:** only flag full `First Last` (two tokens, each ≥ 3 chars) to avoid
  matching common first names that are also English words. Consider **warn**
  (not block) for names, since they're the noisiest.
- **Allowlist:** the public CTA contact and any intentionally-public values live
  in a committed `pii-allowlist.txt` so they don't trip the gate.

## Public-repo safety (critical)

GitHub Actions logs on a public repo are world-readable. The gate must:
- Print only `file:line` + a one-way hash/redacted marker of the matched value.
- Keep the DB connection string in an encrypted secret, never echoed.
- Pull the **minimum** columns needed and hold them only in memory for the run.

## Effort estimate

| Piece | Effort |
| --- | --- |
| Layer 1 static guard (emails + phones) | done (this PR) |
| Layer 2 basic (emails + phones, exact match, fail check, secret wiring, no-PII logs) | ~½–1 day |
| Layer 2 robust (names, normalization, override UX, allowlist, tests) | ~2–3 days total |
| Layer 3 (history scan / Vercel check) | ~½ day each |

## Open questions for review

1. **Names:** block or warn-only? (Recommended: warn-only to start.)
2. **Override UX:** `pii-reviewed` label vs admin merge-bypass? (Recommended:
   label, so the override is explicit and auditable on the PR.)
3. **Scope of scan:** PR diff only, or full tree every run? (Recommended: diff
   for speed, full tree on a nightly schedule.)
4. **DB role:** provision a dedicated read-only Neon role for CI? (Recommended:
   yes — least privilege.)
