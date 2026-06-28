# Branch: `claim-force-redirect-to-profile` — progress log

Branched from `main` (post PRs #58/#59).

## Progress Update as of 2026-05-26 3:20 PM Pacific
*(Most recent updates at top)*

### What's happening (the diagnosis)
After authenticating (LinkedIn/GitHub) to claim a profile, the user
lands on the HOME page instead of their /profile page. A previous
"take me back to my profile" fix existed but did NOT cover this path.

Root cause: a **Clerk dashboard-level default redirect** (effectively
"/"). The claim OAuth flow called:

```
authenticateWithRedirect({
  redirectUrl: "/claim/sso-callback",          // no eval id
  redirectUrlComplete: "/claim/callback?e=…",  // the real destination
})
```

For users who are NEW to Clerk, the OAuth handshake does a
sign-in → **sign-up transfer**, and Clerk DROPS the
`redirectUrlComplete` during that transfer. With no explicit
destination, the dashboard default ("/") wins → user goes home. (The
`/developers` sign-in already worked around the same dashboard default
with `forceRedirectUrl` — see DeveloperConsole.tsx — which is what
tipped us off.)

### The fix
Make `/claim/sso-callback` build an explicit destination and pass it
as `signInForceRedirectUrl` + `signUpForceRedirectUrl` on
`<AuthenticateWithRedirectCallback>`. Force-redirect beats the
dashboard default for BOTH sign-in and sign-up.

The destination is dynamic (per eval), so the eval id now travels on
the sso-callback URL itself:
- `redirectUrl: /claim/sso-callback?e=<id>&return=welcome`

### Files touched:
- `src/app/(authed)/claim/sso-callback/page.tsx` — now a Server
  Component: reads `e` + `return` from searchParams, computes
  `dest = /claim/callback?e=<id>&return=<ret>`, renders `<SsoCallback>`.
- `src/app/(authed)/claim/sso-callback/SsoCallback.tsx` — NEW client
  component wrapping AuthenticateWithRedirectCallback with
  signIn/signUp *force* redirect URLs.
- `src/components/ClaimProfileModal.tsx` — goSso `redirectUrl` now
  carries `?e=<id>&return=welcome`.
- `src/app/(authed)/claim/page.tsx` — `go()` `redirectUrl` now carries
  `?e=<id>&return=welcome`.

(The email-link flow in ClaimProfileModal already put `e` on the
sso-callback URL, so it benefits from the new forced redirect too.)

### Verified:
- `pnpm tsc --noEmit` clean.
- /claim/sso-callback?e=…&return=welcome renders 200 on :3004.

### Potential concerns:
- The real cure for the dashboard default is to set the Clerk
  dashboard "after sign-up/sign-in" URLs to something sane (or rely on
  app-level redirects). This force-redirect approach is robust either
  way and matches the existing /developers pattern. If we ever stop
  passing `e`, the page falls back to `/claim`.
