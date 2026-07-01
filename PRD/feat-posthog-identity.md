## Progress Update as of June 30, 2026 — 10:02 PM Pacific

### Summary of changes since last update
Wired PostHog IDENTITY so a signed-in visitor's events are tied to their account; signed-out visitors stay anonymous. ClerkProvider is scoped to the (authed) route group (not root), so a client PostHogIdentify component mounted there uses useUser(): signed in -> posthog.identify(user.id) (stable Clerk id, NO PII sent — some accounts are minors); signed out -> posthog.reset().

### Detail of changes made:
- components/posthog-identify.tsx (new, client): useUser() → identify by user.id when signed in (only if distinct id changed), reset() when signed out. No-op without NEXT_PUBLIC_POSTHOG_KEY.
- app/(authed)/layout.tsx: mount <PostHogIdentify/> inside ClerkProvider.

### Potential concerns to address:
- Identity is set within the (authed) tree (all real app usage). A signed-in user's visit to the public landing (root layout, no Clerk) stays anonymous — acceptable; the app actions that matter are all authed.
- Deliberately no email/name to PostHog (minor-privacy). Add person properties later only if the team decides it's appropriate.
