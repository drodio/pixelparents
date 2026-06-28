# mobile-events-pass — Mobile audit of non-admin pages (events focus)

## Progress Update as of 2026-06-09 05:37 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Full mobile (390px) audit of the non-admin surface, with a deep pass on `/events/*` (events list, detail, apply, chat, chat thread, photo recap, attendee/connect tables). Most of the surface is already responsive; this branch ships only the small, verified, low-risk wins and leaves a written recommendations list for the judgment-call items (returned to the user in chat).

### Detail of changes made (shipped):
- **`src/components/events/chat/ChatReplyTree.tsx`** — nested-reply indent is now `ml-3/pl-3` on phones (`sm:ml-5 sm:pl-4` from sm up). Deeply nested HN-style replies were compressing the comment text to an unreadable column at 390px (each level added 36px: ml-5 + pl-4, on top of the 36px upvote gutter).
- **`src/app/(authed)/developers/page.tsx`** — endpoints "table": the description span was `ml-auto`, which (with `flex-wrap`) pushed the wrapped description awkwardly to the right edge on phones. Now `sm:ml-auto` so it flows left naturally on mobile, right-aligns on desktop.
- **`src/components/events/PhotoCarousel.tsx`** — bumped under-sized tap targets (zero layout risk, all are absolutely-positioned overlays): inline carousel arrows `h-9 w-9 → h-10 w-10`; lightbox close `h-10 w-10 → h-11 w-11` (now matches its 44px nav-arrow siblings).

### Verified-but-NOT-changed (false positives / intentional):
- `EventChat` thread list: title already `truncate min-w-0` + pill `shrink-0`, so it does NOT wrap — fine.
- `ProfileMiniTable` / `AttendeesTable` grid uses `minmax(0,1fr)` for the name column, so it SHRINKS+truncates rather than overflowing — tight with a Connect button but not broken (see recommendations).
- `SplashForm` prefix/input padding asymmetry is intentional stacked-layout spacing (`flex-col` on mobile), not a misalignment bug.
- Thread-detail h1 + pill, ChatComposer/ReplyComposer/ConnectionInbox button rows: handled acceptably by `flex-wrap`/`items-start`; short error strings. Left as-is.

### Recommendations still open (returned to user; judgment calls / need a real device):
- **ProfileMiniTable name column cramped** at 390px when a Connect button is present (~70–100px for avatar+name+badges). Needs a design decision: e.g. drop Founder/Investor on mobile and show only Combined, or move scores to a second line under the name. Highest-value remaining events item.
- **UpvoteButton** `w-9` (36px) tap target is below 44px; widening hurts nested-thread indent, so it needs a considered fix (e.g. vertical hit-area padding).
- **AttendeePhotoUpload** small controls (remove `h-6 w-6` = 24px, clear-caption, `text-[11px]` auto-caption) — bump for touch in a follow-up with full context of that component.
- Minor polish: events list card gap, event-detail hero `text-3xl` at the smallest widths, ConnectionInbox row stacking on very narrow (<360px) screens.

### Potential concerns to address:
- These were verified by build + Tailwind reasoning, not a real 390px browser (no Playwright in repo). The events recap/chat flows especially deserve a quick real-device once-over.
