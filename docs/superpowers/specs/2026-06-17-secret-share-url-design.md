# Secret share URL — design

**Date:** 2026-06-17
**Status:** Approved (visual mockup approved), implementing.

## Goal

Let a parent who has signed up enable a **secret, shareable URL** that displays
their own family profile (interests, photos, children, optionally contact) to
anyone they give the link to. Off by default. The parent chooses which fields
are visible and can disable the link at any time (which immediately makes it
stop working).

This unblocks the confirmation email, which will reference "here's what I've
submitted: {secret link}".

## Decisions (from brainstorming)

- **Access model:** anyone with the link — no sign-in. Unguessable token in the
  URL. Disabling instantly 404s the page.
- **Data shown:** parent chooses fields. Toggleable: location, parent interests,
  photos, children, phone, email. Name + "shared by" identity always shown.
- **Manage where:** the `/signup/thanks` page (primary — keyed by `signupId`,
  the parent's existing private self-service link) and `/account` (when the
  signed-in Clerk user's email matches a signup row).

## Data model

Add to `signups` (`lib/db/schema/signups.ts`):

- `shareEnabled boolean not null default false`
- `shareToken text unique` — random `base64url` (24 bytes → 32 chars), generated
  on first enable, **kept** when disabled so re-enabling restores the same URL.
- `shareFields text[]` — the field keys currently visible. Null until first
  enabled; defaults applied in code: `["location","interests","photos","children"]`
  on (contact off by default).

Migration generated via `npm run db:generate`; applied by the user with
`npm run db:push`.

## Components & files

- `lib/share.ts` — field-key constants (`SHARE_FIELDS`), default visible set,
  `generateShareToken()` (reuses `randomBytes(24).toString("base64url")`),
  and `shareFieldsOrDefault()`.
- `lib/url.ts` — `getBaseUrl()` for server-side absolute URLs (env
  `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` →
  `https://pixelparents.org`). Used to build the share URL and the email links.
- `lib/share-actions.ts` (`"use server"`) — `setShareEnabled(signupId, on)`,
  `setShareFields(signupId, fields)`. Capability is the `signupId` itself
  (consistent with the existing `saveFamily` trust model on the thanks page).
  Return the current `{ enabled, token, fields }` so the client can update.
- `app/signup/thanks/share-settings.tsx` (`"use client"`) — the management UI:
  an enable toggle; when enabled, the copyable URL + per-field checkboxes. Takes
  initial `{ signupId, enabled, shareUrl, fields }` props.
- `app/p/[token]/page.tsx` — public profile (server component). Looks up the
  signup by `shareToken` with `shareEnabled = true`; `notFound()` otherwise.
  Renders only the enabled fields + children. Styled like the approved mockup
  (black/amber, banner, 🔒 "Shared privately by {firstName}" ribbon, footer).
- Wire `ShareSettings` into `app/signup/thanks/page.tsx` and
  `app/(authed)/account/page.tsx` (latter gated on email match via a new
  `getSignupByEmail` helper).

## Public page behavior

- `shareEnabled = false` or unknown token → `notFound()` (404).
- Only fields present in `shareFields` render. Children render when "children"
  is enabled. Contact (phone/email) only when those keys are enabled.
- Footer notes the owner controls the link and can disable it anytime.

## Out of scope (YAGNI)

- Per-recipient links / view tracking / expiry.
- Passphrase protection (rejected in favor of unguessable token).
- Editing the profile from the public page.

## Follow-up (separate change, after this ships)

- Add the applicant confirmation email (`notifyApplicantWelcome`) that links the
  parent to `{baseUrl}/signup/thanks?id={id}` and explains the secret URL.
