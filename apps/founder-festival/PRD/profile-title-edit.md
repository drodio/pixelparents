## Progress Update as of 2026-06-10 3:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profile tweaks: (a) badge group labels are now bulleted on the LABEL ("• Professional:", "• Industries:", "• Personal:") with no per-pill bullets; (b) the credibility title above the badges is now editable by the owner via a hover pencil (like the name), gated so a claimed member viewing someone else's profile sees NO pencil, an unclaimed visitor gets a claim prompt, and the owner edits inline.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: labels → "• …", removed `bulleted` from Professional/Industries Badges + the per-pill dot on Personal; replaced the static title `<p>` with `<EditCredibilityTitle>`.
- New `src/components/EditCredibilityTitle.tsx` (inline edit / claim-prompt / hidden, per viewer) + `src/app/api/profile/title/route.ts` (owner-gated POST updating evaluations.credibility_title).

### Potential concerns to address:
- Pencil visibility mirrors the events-CTA rule (owner edits; non-member prompts claim; member-on-others hidden).
