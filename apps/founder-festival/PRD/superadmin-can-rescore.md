## Progress Update as of 2026-05-28 10:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixes a UI bug: superadmins / admins were getting prompted to claim a profile when clicking Re-Score on an unclaimed eval. The server-side `/api/rescore` route already allows admins (`if (!owner && !(await isAdmin())) return 403`), but the `ReScoreButton` component only checked `isOwner` and opened the ClaimProfileModal otherwise — so the UI bounced admins off before they ever hit the API. User report: tried to rescore https://festival.so/profile/founder/meruzhan-danielyan as a superadmin, got asked to claim.

### Detail of changes made:
- `src/components/ReScoreButton.tsx`: adds an optional `isAdmin?: boolean` prop (defaults `false`). The claim-gate now checks `if (!isOwner && !isAdmin)` so an admin viewer rescores directly without the claim modal. Matches the server-side gating exactly.
- `src/app/(authed)/profile/page.tsx`: passes the already-computed `isAdminViewer` to the ReScoreButton.
- `src/app/(authed)/not-this-round/page.tsx`: adds the same gating — imports `auth` + `isAdmin`, computes `isAdminViewer`, passes it to ReScoreButton. Previously the not-this-round page didn't pass any owner/admin flag at all, so even an admin viewer would get bounced to the claim modal.
- Drive-by fix: `tests/lib/hn-tokenmaxxing-enricher.test.ts` had a type error on `vi.fn(async (url: string) => …)` that was incompatible with the real `fetch` signature (`URL | RequestInfo`). Coerces via `typeof` check. Same fix I applied on the npm-dependents branch; needed here too since this branch was cut before that fix landed.

### Potential concerns to address:
- **No UI change for non-admins** — the claim modal still fires for them. The fix is targeted to admin viewers only.
- **Bot/scraper hardening** — `isAdmin` is a server-rendered prop; a malicious client could theoretically pass `isAdmin={true}` if they reverse-engineered the component, but the server-side gate in `/api/rescore` rejects with 403 regardless. Defense in depth.
