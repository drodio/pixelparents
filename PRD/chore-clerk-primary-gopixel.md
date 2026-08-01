## Progress Update as of July 15, 2026 — 11:01 PM Pacific

### Summary of changes since last update
First entry. Flips the Clerk multi-domain roles in the app so **gopixel.org is the
PRIMARY** and **pixelparents.org is the SATELLITE** (reverses the prior config).
This is the app-side half of the swap; the Clerk-side primary-domain change is a
dashboard operation (Daniel) that ROTATES the publishable key. **DO NOT MERGE/DEPLOY
until Daniel changes the Clerk primary to gopixel.org AND the new
gopixel.org-primary NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set in Vercel** — deploying
against the old pixelparents.org-primary key breaks auth on BOTH domains.

### Detail of changes made:
- `proxy.ts` (clerkMiddleware options) + `app/(authed)/layout.tsx` (ClerkProvider):
  the per-host satellite conditional now treats **pixelparents.org / www** as the
  satellite (isSatellite=true, domain="pixelparents.org", signInUrl=
  "https://gopixel.org/sign-in"); **gopixel.org** is the primary (no satellite
  config → native sign-in). Kept in lockstep between the two files.

### Why this is needed
- Satellite domains can't host native sign-in (sign-in bounces to the primary), which
  is why gopixel.org sign-in black-screened while it was the satellite. Making
  gopixel.org the primary gives it native, working sign-in.

### Blocking handoff (Daniel, Clerk dashboard) + then me:
1. Clerk dashboard → Domains → change the PRIMARY domain to **gopixel.org**
   (pixelparents.org becomes the satellite). clerk.gopixel.org is already verified;
   clerk.pixelparents.org already exists for the pixelparents satellite FAPI.
2. Copy the NEW production publishable key (pk_live_… encoding clerk.gopixel.org).
3. Me: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (production) to the new key in Vercel,
   merge this PR, redeploy (NEXT_PUBLIC keys bake at build → a rebuild is required),
   and test end-to-end sign-in on gopixel.org + pixelparents.org.

### Potential concerns to address:
- The Clerk SECRET key is a Vercel "sensitive" var (unreadable via API) and the
  primary swap isn't a Backend-API op anyway — so the Clerk-side step MUST be
  Daniel's dashboard action; there is no credential path for me to do it.
- Existing signed-in sessions may need to re-authenticate after the primary swap
  (session tokens are issued by the primary FAPI, which is changing).
