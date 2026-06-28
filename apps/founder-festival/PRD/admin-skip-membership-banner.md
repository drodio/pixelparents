## Progress Update as of 2026-05-28 01:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin users no longer see the red "Your account is not yet active. Add your email and phone to complete your membership." banner. Admins (e.g. users who arrive via the admin accept-invite flow) don't need the member email+phone setup, so the banner was just noise for them.

### Detail of changes made:
- The banner lives in `src/components/MembershipBanner.tsx` and is mounted in `src/app/(authed)/layout.tsx`. It shows when `needsSetup` is true, i.e. the Clerk user is missing a primary email or primary phone.
- The layout already computed `const admin = await isAdmin()` (from `src/lib/admin.ts`) for the "Admin" shortcut. `isAdmin()` returns true for super-admins, the `ADMIN_EMAILS` allowlist, and DB-approved rows in `admin_access` (status = "approved"), which is exactly the row the accept-invite flow writes.
- Single-line change: `<MembershipBanner needsSetup={needsSetup && !admin} />`. Reused the existing `admin` boolean — no new query or fetch.

### Potential concerns to address:
- Admins are exempted purely from the *banner*, not from any real membership gating elsewhere. If an admin also needs a member profile (email+phone) for some member-only feature, that's now silent for them — acceptable per the request, but worth remembering.
- Pre-existing `tsc --noEmit` `LayoutProps` errors persist (Next.js 16 generated globals; cleared by a real `next build`). Local `next build` still stops at page-data collection because `.env.local` has a placeholder `DATABASE_URL`; prod has the real value.
