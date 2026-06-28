## Progress Update as of 2026-06-10 8:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added an endorsement notification email (approved copy). When a claimed member is endorsed, they get an email from hello@festival.so: subject "<Endorser> endorsed you on Founder Festival", header "🎉 You've been endorsed", body "<Endorser> just endorsed you on Founder Festival[ with N of their profile points]." + a ~140-char snippet + "See your endorsement →" link to their profile's Member Endorsements section.

### Detail of changes made:
- New `src/lib/endorsement-email.ts` `sendEndorsementEmail(endorsementId)` — mirrors the chat-mention email: claimed-endorsee only, best-effort (never throws), deduped per endorsement via sent_emails(kind=`endorsement:<id>`). Skips PRIVATE endorsements. Points clause shown only when the endorsee may see the points (public/members_only). Endorser name uses nickname.
- `src/app/api/endorsements/route.ts`: awaits `sendEndorsementEmail(saved.id)` after create/update.

### Potential concerns to address:
- Co-sign/upvotes do NOT email (only the original endorsement), per the agreed default.
- Not behind a feature flag — sends live (consistent with the chat-mention email).
