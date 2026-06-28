# Branch: `main` — progress log

## Progress Update as of 2026-05-28 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the admin-invite acceptance flow end-to-end. A brand-new invitee clicking the email link previously (a) got a Clerk **sign-in** modal instead of sign-up, and (b) after signing up was never actually granted admin — they landed on the "isn't an admin yet" gate. Root cause: `/admin/accept-invite` lives under the `/admin` layout, whose non-admin gate returns `<AdminAccessGate>` *instead of* `{children}`, so the accept-invite page (and its redeem POST) never rendered for an invitee (who is by definition not yet an admin).

### Detail of changes made:
- `src/proxy.ts`: set an `x-pathname` request header (clone headers → `NextResponse.next({ request: { headers } })`) so server layouts can see the path.
- `src/app/(authed)/admin/layout.tsx`: early-return that renders `{children}` bare (no admin chrome, no gate) when `x-pathname` starts with `/admin/accept-invite`. The redeem API's token + verified-email check remains the real security boundary.
- `src/app/(authed)/admin/accept-invite/page.tsx`: removed the broken `redirect('/?then=…')` (the home page never consumed `then`). Now just validates the token and renders `<AcceptInvite/>`, which is fully client-driven.
- `src/components/admin/AcceptInvite.tsx`: now reconciles `useUser()`. Signed-out → auto-opens Clerk **sign-up** (`clerk.openSignUp`) with `forceRedirectUrl`/`signInForceRedirectUrl`/`fallbackRedirectUrl` all pointing back to `/admin/accept-invite?token=…` so redeem fires automatically after auth. Signed-in → the existing redeem POST (guarded to run once).

### Potential concerns to address:
- The fix relies on `x-pathname` from `proxy.ts`. If the proxy `matcher` ever stops covering `/admin/*`, the layout would fall back to gating accept-invite again. Covered today.
- Invitee must sign up/in with the exact invited email (verified). OAuth providers return verified emails; an email mismatch surfaces the existing "invitation was sent to X" message — expected, not a bug.
- `npm run build` fails locally during page-data collection for `/api/score-items` because `.env.local` holds a Vercel secret-reference placeholder for `DATABASE_URL`, not a real Neon URL. Pre-existing and environmental; builds fine on Vercel. `tsc --noEmit` is clean.

## Progress Update as of 2026-05-21 2:13 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`/chatham` copy edit: dropped "as you'll see below" from the Vegas-shorthand intro. Sentence now ends "…although it's actually more nuanced than that."

### Detail of changes made:
- `src/app/chatham/page.tsx`: one-line text edit.

## Progress Update as of 2026-05-21 2:11 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the "festival.so" eyebrow text from `/chatham`. The centered logo above now carries all the branding.

### Detail of changes made:
- `src/app/chatham/page.tsx`: deleted the `<p>festival.so</p>` line in the article header.

## Progress Update as of 2026-05-21 2:09 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Batch of `/chatham` polish: (1) "Chief" is now a link to https://Chief.bot styled with a new `.link` class — gold (`#dfa43a`), no underline, hover fades to 75% opacity. (2) Logo moved from top-left to centered, sized up ~21% (`w-14` → `w-[68px]`). (3) TM symbol after "FounderScore" is now bigger (0.6em → 0.8em) and flush with the word (dropped `ml-0.5`). The same `.link` class is also applied to `/chatham`'s footer back-link and `/not-this-round`'s back-link for consistency.

### Detail of changes made:
- `src/app/globals.css`: added `.link { color: #dfa43a; text-decoration: none; transition: opacity 0.15s ease; }` plus a hover state. CTA buttons styled as `<a>` should NOT use this class — they have their own bg/text colors.
- `src/app/chatham/page.tsx`: Chief is now `<a href="https://Chief.bot" target="_blank" rel="noopener noreferrer" className="link">`. Logo wrapper switched to `self-center`, image to `w-[68px]`. TM `<sup>` simplified.
- `src/app/not-this-round/page.tsx`: back-link uses `link` class instead of `underline text-zinc-300`.

### Potential concerns to address:
- **`.link` is a global class** in plain CSS — not a Tailwind utility. If you'd rather have a Tailwind component class, that's a refactor. Current setup works fine.

## Progress Update as of 2026-05-21 2:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`/chatham` body copy edit on the second section. Replaced the FounderCulture/Storytell paragraph with a shorter one introducing "Chief" as the capture tool and tying access to learnings to the FounderScore™ (with ™ rendered as a superscript matching prior usage).

### Detail of changes made:
- `src/app/chatham/page.tsx`: full paragraph swap. Removed the Storytell.ai external link. "Chief" is currently plain text — wire to a real URL if you want it linked.

### Potential concerns to address:
- **"Chief" unlinked**: ambiguous (could be chief.com, an internal product, or something else). Operator can specify if/where it should link.
- **`FounderScore™`** is now present in copy after we explicitly removed it from the splash button earlier. Intentional inconsistency? Flagging so it's a deliberate choice rather than a copy-paste oversight.

## Progress Update as of 2026-05-21 1:58 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`/chatham` H2 copy edit: "Then how does FounderCulture scale learnings publicly from these private events?" → "How does Founder Festival share out learnings from these private events?" — drops the FounderCulture name and reads more naturally.

### Detail of changes made:
- `src/app/chatham/page.tsx`: H2 of second section updated.

## Progress Update as of 2026-05-21 1:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
`/chatham` copy edit: dropped the parenthetical "(more at About FC Content Permission Levels)." reference (placeholder for a page that doesn't exist) and replaced "FounderCulture" with "Founder Festival events" for self-consistency on this site.

### Detail of changes made:
- `src/app/chatham/page.tsx`: one paragraph now reads "Chatham House Rule forms the basis of how we permission content at Founder Festival events."

## Progress Update as of 2026-05-21 1:53 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the Founder Festival icon at the top-left of `/chatham`. Sized small (w-14 ≈ 56px), wrapped in an `<a href="/">` so it doubles as a home link. Sits at the top of the content column inside the same `max-w-2xl` constraint as the article body, so it visually anchors to the post rather than the page edges. Picked top-left over centered because it reads as a blog mast-head — conventional for editorial layouts.

### Detail of changes made:
- `src/app/chatham/page.tsx`: added a `<a href="/" aria-label="Founder Festival home">` with the logo `<img>` (`w-14 h-auto`) at the top of the article column, above the existing `<header>`.

### Potential concerns to address:
- **Same pattern would benefit other inner pages** (welcome, claim, verified, not-this-round). They currently have an in-text "festival.so" eyebrow but no logo. Easy to extract a `<SiteHeader>` component later if you want consistent branding.

## Progress Update as of 2026-05-21 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Splash submit button: "Check my FounderScore™" → "Check My Score". No trademark, simpler phrasing.

### Detail of changes made:
- `src/components/SplashForm.tsx`: button label simplified, `<sup>` wrapper removed.

## Progress Update as of 2026-05-21 1:42 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a new `/chatham` page in blog-post format. Explains the Chatham House Rule and how FounderCulture scales private-event learnings publicly via Storytell.ai while protecting attribution. Uses the site's display/body fonts (Spectral H1/H2s, Inter body) and gold accent (`#dfa43a`) for the quote-block left rule and the "what you need to remember" callout.

### Detail of changes made:
- `src/app/chatham/page.tsx` (new): server component, no data fetching. Article layout at `max-w-2xl` for prose width. Section headers use `font-display`. Pull-quote has a 2px gold left border. Tip callout has a subtle 6%-alpha gold background with gold border + text. Link to Storytell.ai opens in new tab. Footer "← Back to Founder Festival" link.
- Cross-reference to "About FC Content Permission Levels" is rendered in italic with no link, since that page doesn't exist yet — easy swap to a real `<a>` when it does.
- Page metadata: title "Chatham House Rule · Founder Festival", description matches the topic.

### Potential concerns to address:
- **No navigation linking the page** — `/chatham` is reachable only by direct URL. Add a header/footer nav when there are more inner pages.
- **"About FC Content Permission Levels"** is a placeholder italic reference. Wire to a real route when it's built.

## Progress Update as of 2026-05-21 1:34 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Operator picked variant 10: **Spectral (display) + Inter (body)** — book / long-form scholarly feel. Wired as the site's pairing in `src/app/layout.tsx`. Removed the `/fonts` preview route and its 21 webfont imports.

### Detail of changes made:
- `src/app/layout.tsx`: swapped `Fraunces` → `Spectral` for `--font-display`. Inter remains for `--font-sans`. Both keep weights 600/700 and `display: "swap"`.
- `src/app/fonts/` directory deleted (preview page + all 21 webfont imports).
- All H1s and the welcome score number continue to use `font-display` (now Spectral) via the `font-display` Tailwind utility that resolves through `@theme inline { --font-display: ... }` in globals.css.

### Potential concerns to address:
- **Page weight on prod just dropped** — removing `/fonts` cuts ~21 webfont requests from the build cache. Next/font only bundles what's referenced; the preview imports are gone.
- **Spectral at weight 600/700**: if the H1 needs more thickness for a poster-y feel, bump to `weight: ["700", "800"]` and adjust the Tailwind `font-bold` accordingly. Currently the splash H1 uses `font-bold` which maps to 700.

## Progress Update as of 2026-05-21 1:28 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Expanded `/fonts` from 4 variants to 14. Refactored the page to be data-driven — variants live in a `VARIANTS` array, all required fonts are imported at top, and the component maps over the array. Ten new pairings span the design space: Cinzel + Source Sans 3 (Roman inscription), EB Garamond + Inter (true Garamond), Marcellus + Inter (Roman titling), Bodoni Moda + Inter (Didone), Italiana + Quicksand (couture), Spectral + Inter (book), Libre Bodoni + Lato (newspaper), Crimson Pro + Inter (literary), Source Serif 4 + Source Sans 3 (Adobe editorial), Frank Ruhl Libre + Plus Jakarta Sans (modernist + geometric).

### Detail of changes made:
- `src/app/fonts/page.tsx`: 21 `next/font/google` imports now (14 display + 7 body). Sticky header reads variant count dynamically. Build verified clean.

### Potential concerns to address:
- **Page weight is heavy** — ~21 webfonts at once. Acceptable for a preview/internal route; not for production-facing. Don't leave `/fonts` linked from anywhere user-facing.
- **`Source_Serif_4` and `Source_Sans_3`** are the current Adobe font names on Google Fonts (renamed from Pro). Verified the imports compile.
- **Frank Ruhl Libre** at weight 900 is much darker than the others; if it stands out as an outlier, easy to drop or swap weights.

## Progress Update as of 2026-05-21 1:23 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Operator wanted to compare more font options (felt Fraunces leaned playful). Built `/fonts` as a single page that renders the splash hero four times stacked vertically, each with a distinct serif-display + sans-body pairing — all `next/font/google` so each loads its real webfont via CSS variable scoped to that section. Sticky header at the top labels the page. Also updated the submit button copy from "Continue" → "Check my FounderScore™" (with ™ as a smaller `<sup>`).

### Detail of changes made:
- `src/app/fonts/page.tsx` (new): imports 4 display fonts (Forum, Cormorant Garamond, Playfair Display, DM Serif Display) and 4 body fonts (Lato, Inter, Lora, Manrope) via `next/font/google`. Renders a `<Variant>` component four times — same markup (label header, logo, H1, gold subtitle), different `var(--display-*)` and `var(--body-*)` per variant. All 8 font CSS vars are attached to the outer wrapper div so they actually load.
- `src/components/SplashForm.tsx`: submit button label changed from "Continue" to "Check my FounderScore<sup className='text-[0.6em] align-super ml-0.5'>™</sup>". Loading state is still "Working…".

### Potential concerns to address:
- **8 font requests on `/fonts`**: heavy page weight (~300KB woff2 total). Fine for a preview/internal route, but don't leave it in production navigation. Currently unlinked from anywhere — only reachable by typing `/fonts` directly.
- **No tear-down yet**: once you pick a font, I'll delete `/fonts` and apply the chosen pairing to `layout.tsx`. Don't ship `/fonts` as a permanent route.
- **`FounderScore™`**: the symbol is now in the JSX as a literal `™` character. If you want the cleaner Unicode "TRADE MARK SIGN" treatment (U+2122), it's already that. If you want a registered mark or just "TM" letters, easy swap.

## Progress Update as of 2026-05-21 1:12 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the default Arial fallback with a proper font system. Wired Fraunces (serif display) and Inter (sans body) via `next/font/google`, exposed as CSS vars `--font-display` and `--font-sans` on `<html>`, and registered both in Tailwind's `@theme inline` so `font-display` and `font-sans` are first-class utilities. Applied `font-display` to every H1 on the site (splash, welcome's "Welcome." + score number, not-this-round, verified, claim) and bumped the splash H1 from `text-3xl/sm:text-5xl font-semibold` to `text-4xl/sm:text-6xl font-bold` so Fraunces' character is visible.

### Detail of changes made:
- `src/app/layout.tsx`: imports `Fraunces` (weights 600/700) and `Inter` from `next/font/google`. Both use `display: "swap"`. Their `.variable` strings are attached to `<html>` className. `<body>` keeps `font-sans` (now resolves to Inter via Tailwind).
- `src/app/globals.css`: dropped the unused light-mode CSS vars and the Arial body rule. `@theme inline` now defines `--font-sans: var(--font-sans), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` and `--font-display: var(--font-display), Georgia, "Times New Roman", serif` (fallbacks ensure no FOIT if Google Fonts fail).
- `src/app/page.tsx`: splash H1 now `font-display text-4xl sm:text-6xl font-bold`.
- `src/app/welcome/page.tsx`: "Welcome." + score number use `font-display`.
- `src/app/not-this-round/page.tsx`, `src/app/verified/page.tsx`, `src/app/claim/page.tsx`: H1s use `font-display`.
- Local `pnpm build` confirmed Google Fonts fetch works in this environment.

### Potential concerns to address:
- **Two web fonts add ~40KB woff2 each.** Both are `display: "swap"` so the page renders immediately with system fallbacks and swaps in the web fonts when ready. No FOIT.
- **Welcome page's "Founder Festival Score:" preamble** is still in Inter; the gold subtitle on the splash is in Inter too. That's intentional — display font is for accents/H1s, not running text. Flag if you want them in Fraunces too.
- **Form labels and buttons** remain Inter. Could move the "Do you Qualify?" label to `font-display` if you want it to feel more event-poster-y.

## Progress Update as of 2026-05-21 1:06 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Subtitle closing-line copy edit: "to learn faster and have fun, foster connection and self-discovery." → "to learn faster, foster connection, self-discovery and fun." (moves "fun" to the rhetorical end of the list).

### Detail of changes made:
- `src/app/page.tsx`: one-line text swap on the subtitle's third line.

### Potential concerns to address:
- **Earlier near-miss with the pre-commit hook**: I tried to commit this text change without prepending a PRD entry. The hook correctly blocked the commit but the Vercel CLI deploy that ran alongside it still uploaded the working-tree state. Going forward: always update PRD/main.md FIRST, then `git add`, then commit.

## Progress Update as of 2026-05-21 1:03 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Re-laid the focus-swap. Previous version crossfaded the logo and photo in the same in-flow slot. Operator preferred a full-width background photo at the top of the page that fades into the page bg before reaching the text. New layout: absolutely-positioned photo container spans 100vw x 60vh at `top-0`, sits behind the content (`pointer-events-none`), uses a `bg-gradient-to-b from-transparent via-[#151515]/70 to-[#151515]` overlay to wash into the bg color. Visible only when the URL input is focused (`opacity` transition). Logo stays in normal flow, fades to 0 on focus.

### Detail of changes made:
- `src/app/page.tsx`: photo lives in its own absolute layer above the splash content but `pointer-events-none` so the form remains interactive. Gradient overlay on the photo container fades it into `#151515` before the title.

### Potential concerns to address:
- **Photo height `h-[60vh]`** is a viewport-height value so the fade reaches different points on tall vs short screens. If you want a fixed pixel height instead, use e.g. `h-[480px]`.
- **Photo aspect ratio**: 1695×928 (1.83:1) is stretched/cropped by `object-cover` to fit `100vw × 60vh`. On portrait screens with a tall 60vh, you'll get vertical cropping of the photo. On wide screens, horizontal cropping. Adjust `object-position` (e.g. `object-top`) if the framing focuses on the wrong part of the photo.

## Progress Update as of 2026-05-21 1:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Splash hero now crossfades to the live event-tent photo (`founder-festival-outside.png`, 1695×928) when the LinkedIn input is focused, and back to the logo on blur. Also fixed a Vercel build error (TS couldn't find pngjs types because the one-off `scripts/remove-logo-bg.ts` was included in the type check), edited the subtitle from "high quality event" → "IRL event", and replaced the small grey "Enter your LinkedIn" label with a bold white "Do you Qualify?".

### Detail of changes made:
- `src/app/page.tsx`: converted to client component (`"use client"`). Added `useState` for `focused`. Wraps the hero image in a `relative` container with two `<img>` elements absolutely positioned — logo and outside photo crossfade via opacity (`transition-opacity duration-700`). Photo is cropped to the container via `object-cover` and rounded. Both images preload (rendered with opacity 0/100 toggle, not unmounted, so swap is instant).
- `src/components/SplashForm.tsx`: now accepts optional `onUrlFocus` / `onUrlBlur` props wired to the URL input's onFocus/onBlur. Label text changed to "Do you Qualify?" (text-base, font-bold, text-white; removed uppercase/tracking).
- `src/app/page.tsx`: subtitle line 1 changed from "high quality event learning series" → "IRL event learning series".
- `tsconfig.json`: added `"scripts/**/*"` to `exclude` so the one-off CLI tools (which intentionally import unphycially-typed deps like `pngjs`) don't gate the production build.

### Potential concerns to address:
- **Auto-focus**: the URL input has `autoFocus` so the page loads with the photo already visible (not the logo). If you want the logo to be the first impression, remove `autoFocus` from `src/components/SplashForm.tsx`.
- **Photo box on the splash is `h-48 sm:h-72`** — the logo is small inside that container. On mobile (h-48 = 12rem = 192px), the logo at w-40 (160px) is close to the container width. Tweak if the framing feels off.

## Progress Update as of 2026-05-21 12:53 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Subtitle typography pass: ~30% wider (max-w-xl → max-w-3xl, 576px → 768px, +33%), one font size up (text-base/sm:text-lg → text-lg/sm:text-xl), and explicit three-line break — "An intimate, pop-up, high quality event learning series" / "for venture-backed founders and investors" / "to learn faster and have fun, foster connection and self-discovery." The parent column was bumped from max-w-2xl to max-w-3xl to give the subtitle room.

### Detail of changes made:
- `src/app/page.tsx`: parent column max-w-2xl → max-w-3xl, subtitle max-w-xl → max-w-3xl, text-base/sm:text-lg → text-lg/sm:text-xl, added two `<br />` elements.

### Potential concerns to address:
- **Hard `<br />` breaks** mean the layout is fixed regardless of viewport. On very narrow screens the longest line (line 1, "An intimate, pop-up, high quality event learning series") could still wrap. text-lg at 18px and ~50ch fits comfortably above ~640px; the splash padding is `px-6`, so phones around 360-400px wide will wrap line 1. Acceptable for MVP; revisit if it looks bad.

## Progress Update as of 2026-05-21 12:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two splash polish updates. (1) The logo's dark background was visibly seaming with the page bg (logo interior was `#101010`, page was `#151515` — a 5/256 brightness difference but enough to show a rectangle). Solved by knocking out the dark background of the PNG entirely via a corner-seeded flood-fill — the logo now floats transparently on whatever page bg we use. (2) Added a gold subtitle below the "Founder Festival" headline using `#dfa43a` (sampled as the median of 11,051 gold-toned pixels in the logo artwork).

### Detail of changes made:
- `scripts/remove-logo-bg.ts` (new, committed for reuse if the operator drops in a new logo): BFS flood-fill from all four corners across pixels matching "dark + near-neutral" (RGB sum ≤ 110 AND max-min channel spread ≤ 18). Sets alpha=0 on matched pixels. Result: 40.2% of the 221,112-pixel image is now transparent, 0% partially transparent (clean hard edge — fine at this rendered size).
- `public/images/founder-festival-logo.png`: 370KB → 315KB after knockout. Original is preserved in git history (commit f82996a).
- `src/app/page.tsx`: added subtitle paragraph in `#dfa43a` (gold sampled from the logo) below the H1: "An intimate, pop-up, high quality event learning series for venture-backed founders and investors to learn faster and have fun, foster connection and self-discovery."

### Potential concerns to address:
- **Hard transparency edge on the logo**: the flood-fill uses an all-or-nothing alpha. The smoke artwork fades to dark organically, so some gradient pixels at the boundary may get full transparency where soft alpha would be ideal. At the small display sizes (w-40 / w-56), this is imperceptible — flag if you scale the logo up.
- **`#dfa43a` is the median gold**: not a brand-defined color. If your brand kit specifies an exact gold, edit `src/app/page.tsx` (and consider lifting it to a Tailwind config token).
- **`#151515` page bg is now redundant with the logo's transparent bg.** Could revert to `bg-black` (#000) for a slightly stronger contrast. Leaving `#151515` for now — slightly softer feel, looks intentional.

## Progress Update as of 2026-05-21 12:38 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Brand swap: operator dropped `public/images/founder-festival-logo.png` (498×444 RGBA) and asked for it centered above the splash title with the page background matched to the logo's. Sampled the PNG's corner pixels — uniform RGB(21,21,21) → hex `#151515`. Replaced `bg-black` (#000) with `bg-[#151515]` across all 5 page templates + root layout for visual continuity. Also removed the `festival.so` text eyebrow above the splash headline per the operator's follow-up.

### Detail of changes made:
- `src/app/page.tsx`: removed `<p>festival.so</p>` eyebrow; added `<img src="/images/founder-festival-logo.png">` (w-40 / sm:w-56, native 498×444 so width/height props avoid CLS).
- `src/app/{page,welcome,not-this-round,verified,claim}/page.tsx`: `bg-black` → `bg-[#151515]`.
- `src/app/layout.tsx`: `bg-zinc-50 dark:bg-black` → `bg-[#151515]` (drops the light/dark mode toggle since the design is dark-only).
- Logo sampled with `pngjs` via Node script (one-off, not committed).
- `pngjs` is now in devDependencies as a result of that sampling; harmless but unused at runtime. Can be pruned in a cleanup pass.

### Potential concerns to address:
- **SplashForm form fields stayed `bg-black` (#000) intentionally**, creating slight recessed contrast against the new `#151515` page bg. If you want them to blend instead, change `src/components/SplashForm.tsx:58` and `:94` to `bg-[#151515]`.
- **`festival.so` text still appears in welcome page header** as a brand label next to the Re-Score button. Different from the splash eyebrow — kept for brand clarity in inner pages.
- **`pngjs` is an unused dev dep.** Remove with `pnpm remove -D pngjs` whenever convenient.

## Progress Update as of 2026-05-21 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the shadowy tent background image from the splash. The `<img src="/tent.png">` (CSS grayscale + opacity) added visual noise without much value, and the operator asked for it gone. The splash now renders just the `festival.so` eyebrow, "Founder Festival" headline, and the LinkedIn URL / invite code form on a flat black background. `public/tent.png` also deleted.

### Detail of changes made:
- `src/app/page.tsx`: dropped the `<img>` element and the `relative overflow-hidden` wrapper class. Two child wrappers also had `relative` to stack above the image — those are now unnecessary and removed.
- `public/tent.png`: deleted via `git rm`.

### Potential concerns to address:
- **A future "real" SVG tent**: spec section 2 (page layouts) called for a "shadowy / grayed-out SVG version of the Founder Festival tent." This commit removes the PNG placeholder entirely; if/when a designer-provided SVG arrives, drop it into `public/` and add a single `<svg>` (inlined) or `<img>` element back to `page.tsx`. No code refactor needed.

## Progress Update as of 2026-05-21 10:13 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed rate-limiting behavior that was firing too aggressively for the operator. Two issues: (1) the daily limit was set to 3 — fine for abuse prevention but painful when actively testing multiple LinkedIns; (2) cache hits were incrementing the rate-limit counter, so re-submitting a previously-scored URL spent a quota slot even though no Exa/Claude call ran. Also tightened IP extraction to prefer Vercel's clean `x-vercel-forwarded-for` and `x-real-ip` over the multi-hop `x-forwarded-for`, which on some configurations could lump multiple users behind a proxy into a single IP.

### Detail of changes made:
- `src/app/api/eval/route.ts`: cache check now runs BEFORE the rate-limit check via a new `lookupCachedEval()` helper. A cache hit returns immediately without consuming a quota slot. Daily limit is now read from `EVAL_PER_DAY_LIMIT` env (defaults to 25). Error response includes `limit` and `resetsAt: "midnight UTC"` fields for client display.
- `src/app/api/rescore/route.ts`: same env-driven limit (rescore is always a fresh run, so cache-hit short-circuit doesn't apply).
- `src/lib/eval-pipeline.ts`: extracted `lookupCachedEval(rawUrl)` as a public helper that returns the cached EvalResult or null. `runEval()` continues to do its own cache check internally (idempotent).
- `src/lib/request-ip.ts`: now prefers `x-vercel-forwarded-for` → `x-real-ip` → `x-forwarded-for` (first hop) → `0.0.0.0`. Stops trusting the multi-hop chain as the primary source.
- `.env.example`: documented `EVAL_PER_DAY_LIMIT` env var.

### Potential concerns to address:
- **The bump from 3 → 25 is a defaults-only change.** Vercel production still uses whatever value is in env (or no value = 25). If you want a different number, set `EVAL_PER_DAY_LIMIT` in Vercel's env vars.
- **Per-IP, not per-user.** Two people on the same NAT'd network share the quota. Future: when a user claims their score via Clerk, switch to per-user limits for verified users while keeping per-IP for anonymous.
- **No bypass for operator.** If you regularly burn through 25, consider adding a cookie/header bypass (e.g. signed admin token) so you can test without limits. Out of scope for this fix.

## Progress Update as of 2026-05-21 09:32 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Polish pass: rendered the AI-generated recommendations on the welcome page (Claude was already producing them; we were discarding the output), tightened the scoring rubric so reasoning text matches the math (the "$83M / +80" mismatch), added a `maxOutputTokens: 4000` cap to the eval call (was defaulting to 128K), and dropped the now-unused `@ai-sdk/anthropic` dep + one-off test script. Light mobile tweaks on the splash + welcome layouts.

### Detail of changes made:
- `src/lib/scoring.ts`: rubric now requires the "reason" string to cite the EXACT numbers used in arithmetic. Specifically calls out "If totalRaisedUsd was $8,000,000, never write '$83M' in the reason" to prevent the model from conflating profile values with mismatched highlight figures. Two correctness checks added: (1) score must equal sum of breakdown.points; (2) reason numbers must match calculation inputs.
- `src/lib/eval-pipeline.ts`: `generateObject` call now passes `maxOutputTokens: 4000` (was defaulting to 128K). Removed `import { createAnthropic } from "@ai-sdk/anthropic"` (already unused after gateway routing simplification last commit).
- `src/components/Recommendations.tsx` (new): renders Claude's `recommendations.summary` (paragraph) and `items` (5-8 categorized line items: fundraising / hiring / intros / tactical / positioning / wellbeing). Each item shows a colored category label + sentence text. Wired into welcome page below the breakdown table.
- `src/app/welcome/page.tsx`: reads `evaluations.recommendations` JSONB and renders the new component. Light mobile responsiveness pass (smaller text/padding on sm screens, scaled score number).
- `src/components/SplashForm.tsx`: URL input stacks vertically on mobile (the `https://linkedin.com/in/` prefix is wide). Added `autoCapitalize=none` etc. for mobile keyboards.
- `pnpm remove @ai-sdk/anthropic`: package no longer in deps.
- `scripts/clear-rate-limit.ts`: deleted (testing artifact).

### Potential concerns to address:
- **Recommendations on existing cached evals**: rows scored before this commit have `recommendations: null` and will render nothing on the welcome page. New evals + re-scores will populate. Cache cleared for `drodio` via `pnpm exec tsx scripts/clear-rate-limit.ts` style not done — operator can manually invalidate any old eval with `DELETE FROM evaluations WHERE id = '...'` then re-submit.
- **Reasoning text drift still possible**: prompt now explicitly forbids the wrong pattern but LLMs occasionally violate. Could add a post-hoc validator that scans `reason` strings for dollar values not in `profile.totalRaisedUsd`.

## Progress Update as of 2026-05-21 09:22 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Second live trace flushed out a second bug. After fixing Exa's schema cap, the eval got past Exa but failed on Claude with TLS ECONNRESET against `gateway.ai.vercel.sh/v1/anthropic/messages`. The earlier subagent's manual `createAnthropic({ baseURL })` override was using a stale/incorrect host. AI SDK v6 routes plain `"provider/model"` strings through the Vercel AI Gateway natively when `AI_GATEWAY_API_KEY` is set — so the manual override is both unnecessary and actively broken. Removed it; passing the string `"anthropic/claude-opus-4-7"` directly to `generateObject` now.

### Detail of changes made:
- `src/lib/eval-pipeline.ts`: dropped `import { createAnthropic } from "@ai-sdk/anthropic"` and the `getAnthropicModel` helper. Now exports a `MODEL_ID = "anthropic/claude-opus-4-7"` constant and passes it directly to `generateObject({ model: MODEL_ID, ... })`. AI SDK handles gateway routing internally.
- `pnpm build` clean, 24/24 tests still passing (no changes touched test fixtures since mocks ignored the model arg anyway).

### Potential concerns to address:
- **`@ai-sdk/anthropic` is now an unused dependency.** Remove it in a follow-up cleanup commit if AI Gateway proves stable.
- **`max_tokens: 128000` appeared in the failed request body** (extended thinking limit). AI SDK is choosing a high cap by default; could lower to ~8192 for the eval to reduce overhead, but not critical.

## Progress Update as of 2026-05-21 09:18 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First end-to-end live trace of `/api/eval` surfaced a real bug: Exa's `outputSchema` caps total properties at 10 (across all nesting), but our PROFILE_SCHEMA had ~21. Exa returned a 400 "Output_schema exceeds maximum of 10 properties" in 2.8s. Fixed by flattening PROFILE_SCHEMA to exactly 10 scalar fields, dropping the nested `currentCompany`/`pastCompanies` objects and `githubUrls`. To preserve richness for Claude's reasoning, the eval pipeline now also forwards Exa's per-source `searchHighlights` to the scoring prompt — Claude reads those for stage detection, citation-style breakdown wording, and recommendations.

### Detail of changes made:
- `src/lib/exa.ts`: PROFILE_SCHEMA now has 10 properties: `fullName`, `isCurrentFounder`, `isPastFounder`, `primaryCompanyDomain`, `totalRaisedUsd`, `wentToYC`, `exitCount`, `isCurrentlyProfitable`, `hadCofounders`, `signalQuality`. `researchLinkedinProfile` returns a new `searchHighlights` array (top 10 results × top 3 highlights each).
- `src/lib/eval-pipeline.ts`: `lookupMmRanks` now uses `profile.primaryCompanyDomain` (single domain lookup) — drives founder-vs-employee branching off `isCurrentFounder || isPastFounder`. `scoreWithClaude` accepts and forwards `searchHighlights`.
- `src/lib/scoring.ts`: `buildScoringPrompt` formats `searchHighlights` into a bulleted "SEARCH HIGHLIGHTS" block. Rubric language updated to match the new flat field names. companyStage and recommendations are still produced by Claude from the highlights + facts.
- `src/lib/identity-match.ts`: GitHub matching now relies on display-name only (we dropped `githubUrls` from PROFILE_SCHEMA). Work-email match reads `primaryCompanyDomain`.
- `tests/lib/identity-match.test.ts`: updated to match new shape; all 24 tests across 7 files pass.

### Potential concerns to address:
- **GitHub identity-match coverage narrowed.** Without explicit `githubUrls` in PROFILE_SCHEMA, only display-name-match qualifies as a medium-confidence match. If a user signs in with GitHub under a different display name they'll fall to low confidence and be asked to try another provider. Acceptable for MVP; can re-add a second Exa `/contents` pass for GitHub URLs later.
- **Single domain only for MM lookup.** If a founder's biggest hit was at a past company different from `primaryCompanyDomain`, we may miss the higher-ranked MM signal. Mitigation: the Exa prompt asks the LLM to pick the "most relevant" company. Could expand to a tiny array later (still within the 10-property cap if we accept losing `hadCofounders` or similar).
- **Highlights add to prompt token count.** Up to 10 results × 3 highlights × 400 chars = ~12K extra characters per eval. Claude opus-4-7 handles this trivially but does add ~$0.01 per eval. Worth it.

## Progress Update as of 2026-05-21 07:08 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Found why Vercel deploys have been silently failing all morning: every commit's author email was `drodio@iMac.attlocal.net` (the Mac's auto-generated default) which isn't tied to the operator's GitHub account, so Vercel blocked each deploy under its "deployment authorship" check. Fixed: `git config --global user.email "drodio@gmail.com"`. This commit is the first one under the new email and should unblock the entire chain.

### Detail of changes made:
- `.gitignore`: added `!.env.example` exception so future contributors can `git add .env.example` without `-f`.
- This commit also serves as the trigger commit for the unblocked Vercel deploy.

### Potential concerns to address:
- **Older commits still bear the wrong author email.** Vercel only checks the latest commit, so this doesn't block deploys, but `git log` history will show `drodio@iMac.attlocal.net` on every commit through `9f8110b`. Cleanup options: leave as-is (cosmetic), rebase + force push (destructive, not recommended on main), or rewrite via `git filter-branch` (out of scope for MVP).

## Progress Update as of 2026-05-21 06:54 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Final-pass code review flagged two issues; both fixed:
- **Critical**: Welcome page `Show me events` link dropped the evaluationId. Without `?e=<id>`, the `/claim/callback` route always 302'd back to `/`, silently breaking the entire claim flow. Fixed: `href={\`/claim?e=${row.id}\`}`.
- **Defensive**: `reEvaluate()` now throws an explicit error when called on a code-redeemed evaluation (placeholder `code:<uuid>` linkedinUrl would fail canonicalization). UI already guards via `row.source === "url"`, but the API surface is now hardened.

### Detail of changes made:
- `src/app/welcome/page.tsx` — claim link now carries the eval id.
- `src/lib/eval-pipeline.ts` — `reEvaluate` rejects code-sourced rows with a clear error message.
- `pnpm build` clean after fixes.

### Potential concerns to address:
- **Other code-review findings deferred** (intentional, documented in spec assumptions): no Exa retry on 5xx, no "Contact us" after 3 claim attempts, no `POST /api/claim/match` endpoint (logic merged into GET callback), `recommendations.items.category` uses `wellbeing` vs spec's `mental-health` (cosmetic).
- TOCTOU race in `reEvaluate` (delete-then-insert) is low-probability and not a single-user issue.

## Progress Update as of 2026-05-21 06:48 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
MVP build complete across 12 commits (aee24d7 → f26e8ec). All 20 plan tasks landed. Splash tent PNG dropped into `public/tent.png` from the operator's cached logo upload (image #2 — the standalone gold-on-white tent). Production deploy in flight. Local `pnpm build` is clean (13 routes including the cron).

### Detail of changes made:
- Splash tent PNG copied to `public/tent.png` from `/Users/drodio/.claude/image-cache/.../2.png`. CSS treats it with `opacity-[0.08] grayscale blur-[2px]` for the shadowy effect.
- `vercel deploy --prod` triggered for the full MVP.
- 18 vitest tests passing across canonicalize, rate-limit, exa, scoring, eval-pipeline, identity-match, redeem (all live Neon, Exa + AI SDK mocked).

### Potential concerns to address:
- **`EXA_API_KEY` value not yet supplied to Vercel.** `/api/eval` will return 503 until set. User has the key locally but the placeholder is still `.env.example`.
- **`AI_GATEWAY_API_KEY` provisioning.** The eval orchestrator uses `createAnthropic({ baseURL: "https://gateway.ai.vercel.sh/v1/anthropic" })` as a fallback.
- **Clerk v7 OAuth providers**: LinkedIn (`oauth_linkedin_oidc`) and GitHub (`oauth_github`) must be enabled in Clerk dashboard manually.
- **Preview env scope for `MM_REFRESH_SECRET` and `CRON_SECRET`** is missing — add via Vercel dashboard.
- **`.env.example` is matched by `.env*` gitignore.** Add `!.env.example` exception eventually.

## Progress Update as of 2026-05-21 06:46 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Tasks 18 and 19: weekly cron for Majestic Million refresh + admin script and docs for managing bypass codes. Clean build with `/api/cron/refresh-mm` route. Secrets landed in Vercel Production and Development; Preview skipped (CLI plugin blocks branch-less preview env adds — operator can add via dashboard).

### Detail of changes made:
- `src/app/api/cron/refresh-mm/route.ts` — GET handler that downloads the Majestic Million CSV, writes to tmpdir, calls `loadCsvIntoNeon`, and returns `{ ok, rows }`. Accepts `Authorization: Bearer <secret>` using `MM_REFRESH_SECRET ?? CRON_SECRET`. `maxDuration = 300`.
- `vercel.json` — crons config: `0 3 * * 0` (Sundays 03:00 UTC) targeting `/api/cron/refresh-mm`.
- `scripts/insert-code.ts` — CLI script to insert a `bypass_codes` row. Flags: `--code`, `--maxUses`, `--score`, `--expires`, `--note`.
- `package.json` — updated `insert-code` script to include `DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config` (matches `bootstrap-mm` pattern).
- `docs/admin-codes.md` — operator guide for minting, revoking, and auditing bypass codes via script or raw SQL.
- Env vars: `MM_REFRESH_SECRET` and `CRON_SECRET` added to Vercel Production and Development environments. Both values pulled to `.env.local`. Preview environment skipped due to CLI limitation (operator to add via Vercel dashboard if needed). Note: values differ across environments — for production cron, `MM_REFRESH_SECRET` or `CRON_SECRET` just needs to match what Vercel sends as `CRON_SECRET`.
- Smoke test: `pnpm insert-code --code=BOOTSTRAP-TEST --maxUses=1 --score=25 --note="initial smoke test"` — inserted row confirmed in Neon.

### Potential concerns to address:
- `MM_REFRESH_SECRET` and `CRON_SECRET` were added as separate values per environment (not a single shared value). For production cron: Vercel will send `Authorization: Bearer <CRON_SECRET>` and the route checks `MM_REFRESH_SECRET ?? CRON_SECRET` — so as long as `CRON_SECRET` in production matches what Vercel sends, it will work. Operator should verify via Vercel dashboard that production `CRON_SECRET` value matches the auto-injected Vercel cron secret.
- Preview env vars not set (CLI plugin requires `--value` flag for preview but then blocks with git_branch_required). Use Vercel dashboard to add if preview cron testing is needed.

## Progress Update as of 2026-05-21 06:40 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Tasks 16 and 17: identity match algorithm + Clerk-driven claim flow. 6/6 tests pass, clean build with 4 new routes.

### Detail of changes made:
- `src/lib/identity-match.ts` — `matchConfidence(claim, evaluationLinkedinUrl, profile)` function. LinkedIn: exact URL normalization → high. GitHub: username in `githubUrls` or display name match → medium. Email: work domain matches `currentCompany.domain` → medium. All other cases → low.
- `tests/lib/identity-match.test.ts` — 6 unit tests, all passing.
- `src/app/claim/page.tsx` — Client component with Suspense boundary (required for `useSearchParams`). Three provider buttons (LinkedIn, GitHub, email-soon). Uses Clerk v7 `signIn.sso({ strategy, redirectUrl, redirectCallbackUrl })` — note: NOT `authenticateWithRedirect` which was removed in v7's new signal-based API.
- `src/app/claim/sso-callback/page.tsx` — Clerk's `AuthenticateWithRedirectCallback` handoff (still present in v7).
- `src/app/claim/callback/route.ts` — GET route: validates auth + evaluation row, builds `ClerkClaim` from `currentUser().externalAccounts`, runs `matchConfidence`, upserts `users` row, redirects to `/verified` (high/medium) or `/claim?denied=1` (low).
- `src/app/verified/page.tsx` — Static verified confirmation page.

### Potential concerns to address:
- Clerk v7 changed `useSignIn()` to return `SignInSignalValue` (no `isLoaded` field) with `SignInFutureResource` (new signal-based API). OAuth is now `signIn.sso()` not `signIn.authenticateWithRedirect()`. The `redirectCallbackUrl` param replaces `redirectUrlComplete`. The plan spec used old v6 API — adapted to v7 actual types.
- LinkedIn + GitHub OAuth providers must still be enabled manually in Clerk dashboard by operator before buttons work at runtime.

## Progress Update as of 2026-05-21 06:34 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Tasks 13, 14, and 15: the three core public pages (splash `/`, welcome `/welcome`, not-this-round `/not-this-round`) plus three components (`SplashForm`, `ScoreTable`, `ReScoreButton`). Build is clean with all three new routes in the route table.

### Detail of changes made:
- `src/app/page.tsx` — Replaced Clerk-based placeholder with the new splash page: black background, faint tent.png watermark, `SplashForm` centered.
- `src/components/SplashForm.tsx` — Client component. LinkedIn handle input posts to `/api/eval`; routes to `/welcome?e=` on success or `/not-this-round` on low-signal. Optional invite code form posts to `/api/redeem`.
- `src/app/welcome/page.tsx` — Server component. Reads evaluation row from Neon by `?e=` param, redirects to `/not-this-round` if low-signal URL eval, renders score (tabular-nums) + `ScoreTable` + `ReScoreButton`.
- `src/components/ScoreTable.tsx` — Pure server component. Renders breakdown rows; shows invite-code fallback text if rows empty.
- `src/components/ReScoreButton.tsx` — Client component. Posts to `/api/rescore` then navigates to result.
- `src/app/not-this-round/page.tsx` — Static page. Prompts user to verify their LinkedIn URL with back link.

## Progress Update as of 2026-05-21 06:32 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Implemented the three front-of-funnel API routes: `/api/eval`, `/api/redeem`, and `/api/rescore`. All 2 integration tests pass (live Neon). Build is clean.

### Detail of changes made:
- `src/app/api/eval/route.ts` — `POST /api/eval`: validates LinkedIn URL via `isValidLinkedinUrl`, enforces 3/IP/day rate limit via `checkAndIncrementRateLimit`, delegates to `runEval(url, "url")`, returns `EvalResult` JSON. `maxDuration = 60`.
- `src/app/api/redeem/route.ts` — `POST /api/redeem`: atomic `UPDATE bypass_codes ... RETURNING` to claim a code (prevents double-spend at max_uses boundary), inserts a placeholder evaluation row with `source="code"` and the assigned score, returns `{ evaluationId, assignedScore, status: "redeemed" }`. No rate limit (code possession is its own gate).
- `src/app/api/rescore/route.ts` — `POST /api/rescore`: validates `evaluationId` present, enforces 3/IP/day rate limit, delegates to `reEvaluate(evaluationId)`. `maxDuration = 60`.
- `tests/api/redeem.test.ts` — 2 integration tests: valid code redemption (score=50, evaluationId defined), invalid code rejection (400). Live Neon; cleanup in before/afterAll.

### Potential concerns to address:
- None. Build clean, tests 2/2 pass.

## Progress Update as of 2026-05-21 06:30 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Wired together the eval orchestrator: cache check → Exa research → low-signal short-circuit → Majestic Million lookup → Claude scoring → Neon persistence. All 3 unit tests pass (live Neon, mocked Exa + AI SDK).

### Detail of changes made:
- `src/lib/eval-pipeline.ts` — `runEval(rawUrl, source)`: canonicalizes URL, checks Neon cache, calls `researchLinkedinProfile`, short-circuits on low signal, calls `lookupMmRanks` (Drizzle `inArray` query against `majestic_million`), calls `scoreWithClaude` via `generateObject`, validates breakdown sum matches score (auto-fixes if not), persists to `evaluations` and returns `EvalResult`. `reEvaluate(evaluationId)`: deletes existing row and re-runs `runEval` for rescoring. `getAnthropicModel(modelId)`: routes through Vercel AI Gateway (`baseURL` override) when `AI_GATEWAY_API_KEY` is set; falls back to direct `createAnthropic()` (uses `ANTHROPIC_API_KEY`) otherwise.
- `tests/lib/eval-pipeline.test.ts` — 3 tests: full end-to-end with mocks (score=30, status=scored, 2 breakdown rows), cache hit returns same evaluationId, low-signal mock returns status=low-signal + score=0.

### Potential concerns to address:
- **AI Gateway URL**: The spec says `"anthropic/claude-opus-4-7"` as a plain string would route through the gateway, but `generateObject` in `ai` v6 requires a `LanguageModel` object. Used `createAnthropic({ baseURL: "...", apiKey: gatewayKey })` pattern instead — functionally equivalent but the exact gateway URL (`https://gateway.ai.vercel.sh/v1/anthropic`) needs to be verified against the Vercel AI Gateway docs when `AI_GATEWAY_API_KEY` is provisioned. The fallback (direct Anthropic API) works today.
- **`temperature` parameter**: Passed as `0.2` in `generateObject` — `ai` v6 accepts this via `CallSettings`. No issues observed.
- Tests mock both `@/lib/exa` and `ai` entirely, so they don't burn API quota. The Neon writes/reads are live (cleanup in before/afterEach).

## Progress Update as of 2026-05-21 06:26 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Streamed Majestic Million CSV loader into Neon. Bootstrap ran successfully via HTTP driver: 1,000,000 rows loaded in ~2 minutes (200 batches × 5,000 rows).

### Detail of changes made:
- `src/lib/mm-loader.ts` — `parseMajesticCsv` (async generator streaming CSV line-by-line, extracts GlobalRank + Domain columns), `upsertBatch` (Drizzle insert...onConflictDoUpdate targeting rank PK), `loadCsvIntoNeon` (orchestrates batching, logs every 5,000 rows).
- `scripts/bootstrap-mm.ts` — resolves CSV path, calls `loadCsvIntoNeon`, logs elapsed time and final count; exits non-zero if CSV is missing.
- `package.json` — `bootstrap-mm` script uses `DOTENV_CONFIG_PATH=.env.local tsx --require dotenv/config` so `.env.local` is loaded before db module initialization.

### Potential concerns to address:
- HTTP driver path worked fine at ~500k rows/min. The `bootstrap-mm` script uses Neon HTTP driver (not pg unpooled), so future runs will be re-runs (upserts) and should complete in similar time.
- `package.json` script requires `DOTENV_CONFIG_PATH` env var pattern — this is the canonical way to load `.env.local` with tsx without a dotenv CLI wrapper.

## Progress Update as of 2026-05-21 06:20 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Added Exa client with PROFILE_SCHEMA and scoring rubric module. Both are pure schema/data modules with no network calls at import time. All 5 tests pass.

### Detail of changes made:
- `.env.example` — documents all required environment variables (DATABASE_URL, DATABASE_URL_UNPOOLED, CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, EXA_API_KEY, AI_GATEWAY_API_KEY, MM_REFRESH_SECRET, CRON_SECRET).
- `src/lib/exa.ts` — `PROFILE_SCHEMA` (JSON Schema `as const` for literal types), `ExaProfile` TypeScript type, `getExaClient()` (throws if EXA_API_KEY missing), `researchLinkedinProfile(linkedinUrl)` (deep Exa search with outputSchema, returns ExaProfile + grounding).
- `src/lib/scoring.ts` — `SCORING_RUBRIC` (LLM prompt string with full point rules), `SCORING_SCHEMA` (Zod v4 schema), `ScoringResult` type, `MMLookup` type, `buildScoringPrompt(profile, mm)`, `validateBreakdownSumsToScore(r)`.
- `tests/lib/exa.test.ts` — 2 tests: PROFILE_SCHEMA shape validation, getExaClient throws without EXA_API_KEY.
- `tests/lib/scoring.test.ts` — 3 tests: validateBreakdownSumsToScore true/false cases, buildScoringPrompt embeds profile and MM context.

### Potential concerns to address:
- None. All modules are pure schema/data — no DB or network calls during normal execution. They will be consumed by the eval orchestrator (T9) and /api/eval route (T10).

## Progress Update as of 2026-05-21 06:17 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Added three utility modules: LinkedIn URL canonicalization, request-IP extraction, and Neon-backed rate limiting. All tests pass (7 canonicalize + 1 rate-limit against live Neon).

### Detail of changes made:
- `src/lib/canonicalize.ts` — `canonicalizeLinkedinUrl` (strips www, lowercases, drops trailing slash/query/hash, rejects non-`/in/` paths) and `isValidLinkedinUrl` wrapper.
- `src/lib/request-ip.ts` — `getRequestIp(headers)` reads `x-forwarded-for` (first IP) then `x-real-ip`, falls back to `0.0.0.0`.
- `src/lib/rate-limit.ts` — `checkAndIncrementRateLimit(ip, perDay)` upserts into the `rate_limit` table via raw SQL, handles both neon-http driver return shapes (array or `{ rows: [] }`), returns `true` while `count <= perDay`.
- `tests/lib/canonicalize.test.ts` — 7 tests covering normalization, query/hash stripping, www stripping, and rejection of non-LinkedIn/garbage URLs.
- `tests/lib/rate-limit.test.ts` — 1 integration test: allows exactly N requests then blocks N+1 against live Neon.

### Potential concerns to address:
- None. All utilities are pure or thin DB wrappers. Rate-limit test uses `test-ip-127.0.0.1` as the test key and cleans up in `beforeEach` to avoid cross-run interference.

## Progress Update as of 2026-05-21 06:15 AM PDT
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the placeholder `interest` table in `src/db/schema.ts` with all 6 MVP tables and pushed the schema to Neon. The `interest` table was dropped directly via the neon HTTP client (required because Drizzle's `db:push` table-resolver requires a TTY for interactive rename/drop prompts). All 6 tables confirmed present: `bypass_codes`, `evaluations`, `majestic_million`, `rate_limit`, `recommendation_responses`, `users`.

### Detail of changes made:
- `src/db/schema.ts` — fully replaced with 6 Drizzle table definitions: `evaluations` (UUID PK, linkedin_url unique index, JSONB columns for breakdown/profile/recommendations/exa_grounding/pricing, source + source_code), `bypass_codes` (case-insensitive code unique index, assigned_score for content tiering), `majestic_million` (integer rank PK, domain index), `users` (clerk_user_id unique, FK to evaluations), `recommendation_responses` (composite unique on evaluation_id + item_id), `rate_limit` (composite PK on ip + day).
- Dropped the `interest` placeholder table via `neon()` HTTP client before pushing, bypassing Drizzle's TTY-required table resolver.
- `pnpm db:push` completed with `[✓] Changes applied`.
- Verified all 6 tables present in `pg_tables` via direct query.

### Potential concerns to address:
- Drizzle `db:push` requires a TTY for interactive rename/drop resolution — running non-interactively (as Claude Code does) will always fail if there are existing tables to drop. Workaround: drop conflicting tables manually before pushing. Consider using `drizzle-kit generate` + `drizzle-kit migrate` workflow for future schema changes to avoid this.
- The `pricing` and `recommendations` JSONB columns and the `recommendation_responses` table will remain unused until v1.5. Monitor for drift if MVP behavior evolves.

## Progress Update as of 2026-05-21 06:12 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Installed all foundation dependencies for the MVP: the Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), Exa client (`exa-js`), and schema validation (`zod`) as runtime deps; added `vitest`, `@vitest/coverage-v8`, and `tsx` as dev deps. Wired up the test runner with a `vitest.config.ts` that aliases `@` to `src/` and points at a dotenv setup file, and created `tests/setup.ts` to load `.env.local` before any test run. Added `test`, `test:watch`, `bootstrap-mm`, and `insert-code` scripts to `package.json`.

### Detail of changes made:
- `pnpm add ai@6.0.188 @ai-sdk/anthropic@3.0.78 exa-js@2.13.0 zod@4.4.3` — runtime deps for eval orchestrator, Exa research, and schema validation.
- `pnpm add -D vitest@4.1.7 @vitest/coverage-v8@4.1.7 tsx@4.22.3` — test runner, coverage provider, and TS script executor.
- Created `vitest.config.ts` — node environment, `@` alias to `./src`, setup file `./tests/setup.ts`.
- Created `tests/setup.ts` — loads `.env.local` via dotenv so integration tests can access real env vars.
- Added scripts to `package.json`: `test`, `test:watch`, `bootstrap-mm`, `insert-code`.
- Verified: `pnpm exec vitest --version` → `vitest/4.1.7 darwin-arm64 node-v23.11.0`.

### Potential concerns to address:
- `zod` installed at v4.4.3 — Zod v4 has breaking changes from v3 (no `z.string().url()` options, `z.object()` strict by default). Downstream tasks should use v4 API patterns.
- `@types/node` was already at `^20` in devDeps; the new install left it at `^20`. If any deps require Node 22 types, bump to `@types/node@^22` in a later task.
- esbuild build scripts remain ignored by pnpm (pre-existing warning). No impact on test runner or scripts, but `pnpm approve-builds` may be needed if esbuild-dependent tooling fails at runtime.

## Progress Update as of 2026-05-21 06:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the implementation plan at `docs/superpowers/plans/2026-05-21-festival-mvp.md`. 20 tasks, TDD-structured, each producing a focused commit. Next step is autonomous execution via the superpowers:subagent-driven-development skill while the operator is away.

### Detail of changes made:
- Plan decomposes the MVP into: deps install → schema → URL canonicalizer → request-IP → rate-limit → Exa client → scoring module → MM CSV loader/bootstrap → eval orchestrator → 3 API routes (eval, redeem, rescore) → 3 pages (splash, welcome, not-this-round) → identity match + claim flow (provider buttons + SSO callback + match route + verified page) → cron route + vercel.json → admin docs/script → final deploy + verify.
- Self-reviewed plan: every spec section maps to at least one task, no placeholders, types consistent (`EvalResult`, `ScoringResult`, `ExaProfile`, `ClerkClaim` named/shaped the same wherever referenced).
- Cron secret will be generated and pushed to all 3 envs via `vercel env add` during Task 18.
- The plan keeps `email_link` claim strategy as a stub for MVP (Clerk needs an explicit email handoff form which is more UX than this MVP justifies). LinkedIn + GitHub OAuth are functional.

### Potential concerns to address:
- **Exa output schema typing**: `outputSchema` is documented but not yet typed in `exa-js`. The plan uses a `@ts-expect-error` to bypass; revisit when types ship.
- **`@ai-sdk/anthropic` + AI Gateway interop**: Vercel docs say plain `provider/model` strings work; if there's a runtime requirement for the actual `@ai-sdk/anthropic` factory we'll know quickly from `generateObject` errors during Task 9 testing.
- **Clerk LinkedIn OAuth**: Clerk's LinkedIn provider returns `username` in the external account but it's the vanity, not always identical to what's in someone's profile URL. The identity-match algorithm normalizes both sides.
- **MM bootstrap is ~1M HTTP-driver upserts**: this will be slow against Neon's HTTP driver (~5-10 min for the full file). Consider switching the bootstrap script to use the unpooled pg driver if the HTTP route becomes painful.
- **No automated visual/e2e tests**: relying on `pnpm build` + manual verification of the four core flows in production. Add Playwright in v1.5.

## Progress Update as of 2026-05-21 06:02 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed and wrote the design spec for the festival.so MVP. The product is now defined: visitors enter a LinkedIn URL (or invite code), the system runs an Exa "deep" research + single Claude (via Vercel AI Gateway) eval, and renders a black "Welcome / Founder Festival Score" page with a transparent breakdown table. A "claim your score" flow runs Clerk OAuth (LinkedIn / GitHub / work-email) to verify identity. Future work — variable Stripe membership fee based on score+company stage, and a Hell-No → Hell-Yes recommendation rating UI — is reserved in the data model but not built. Spec lives at `docs/superpowers/specs/2026-05-21-festival-mvp-design.md`.

### Detail of changes made:
- Created `docs/superpowers/specs/2026-05-21-festival-mvp-design.md` (single source of truth for MVP scope, scoring rubric, data model, API surface, identity match algorithm, error handling, and out-of-scope list).
- Scoring rubric is per user's exact rules: founder +5/+10, $1M VC +10 each, YC +10, exits +10 each, profitable +10, co-founders +5, Majestic Million ranking `min(100, 10000/rank)` (×0.1 if employee not founder).
- Data model planned across 6 Neon tables: `evaluations` (keyed by linkedin_url with JSONB columns for profile/breakdown/grounding/pricing/recommendations), `bypass_codes` (with `assigned_score` for code-based content tiering), `majestic_million` (weekly cron refresh), `users` (Clerk-linked, only on claim), `recommendation_responses` (reserved for v1.5 UI), `rate_limit`.
- Pricing column on `evaluations` is reserved for future Stripe fee snapshot — no Stripe code in MVP.
- Recommendations (summary + 5-8 line items) are produced by the same Claude call as the score; UI ratings deferred but data shape is locked.
- Identity match: LinkedIn = High (vanity name compare), GitHub = Medium (Exa-found URL OR display-name match against new `profile.githubUrls[]`), Work email = Medium (domain match). Low confidence → loop with another provider.
- `scripts/data/majestic_million.csv` (~77MB, 1M rows) supplied by operator and gitignored. Used for initial bootstrap; cron downloads fresh CSVs from downloads.majestic.com weekly (Sundays 03:00 UTC).
- Approved assumptions documented in spec Section 12: CSS-grayscale on existing PNG for splash tent (SVG later), Neon-backed rate limit (3/IP/day), Claude model `anthropic/claude-opus-4-7` via AI Gateway, 30s eval latency budget, SQL-based code admin (no UI), Sundays 03:00 UTC cron.
- Domain TLS now works on festival.so (verified — Vercel cert issued after DNS propagated through Cloudflare + Namecheap nameserver switch). Current 404 is because the original GitHub-triggered prod deploy stuck at status UNKNOWN; a fresh `vercel --prod` is running to rebind the apex.

### Potential concerns to address:
- **Original prod deployment stuck at UNKNOWN** for 1h+. New CLI deploy is queued; if that also hangs, dig into Vercel build logs (likely AI Gateway init or env-var issue).
- **`EXA_API_KEY` value not yet supplied.** User pasted the Exa setup docs with `YOUR_API_KEY` placeholder. Implementation will add it to `.env.example`; need real value before eval can run.
- **`AI_GATEWAY_API_KEY` needs to be provisioned.** Vercel auto-provisions on AI SDK usage when AI Gateway is enabled, but may need manual click-through in dashboard.
- **Clerk LinkedIn + GitHub OAuth providers must be enabled in Clerk dashboard.** Manual step — implementation plan includes a docs note.
- **77MB CSV in `scripts/data/`** — gitignored; if operator changes machines, bootstrap script must download from majestic.com.
- **`recommendation_responses` and `pricing` columns will sit unused for weeks.** Drift risk: if MVP behavior diverges from spec, these will need to be revisited before v1.5 builds.

## Progress Update as of 2026-05-21 04:54 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Initial scaffold of festival.so. Greenfield Next.js 16 app (App Router, TypeScript, Tailwind v4) wired to Clerk auth and a Neon Postgres database, both provisioned through the Vercel Marketplace into the `drodio1s-projects` team. Linked to the GitHub repo `drodio/founder-festival` and to the Vercel project `drodio1s-projects/founder-festival`.

### Detail of changes made:
- Scaffolded with `pnpm dlx create-next-app@latest` — TS, Tailwind, ESLint, App Router, `src/` dir, `@/*` alias, pnpm.
- Linked to Vercel project `drodio1s-projects/founder-festival` (`.vercel/project.json`). GitHub repo connected for auto-deploy from `main`.
- Provisioned **Neon** via `vercel integration add neon` → resource `neon-canary-paddle`. Env vars (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`, `NEON_PROJECT_ID`, `NEON_AUTH_BASE_URL`) pulled into `.env.local`.
- Provisioned **Clerk** via `vercel integration add clerk` → resource `clerk-cyan-battery`. `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` pulled into `.env.local`.
- Clerk v7 wiring: `ClerkProvider` in `src/app/layout.tsx`, route protection in `src/proxy.ts` (was `middleware.ts`, renamed for Next 16). Note: v7 dropped `<SignedIn>`/`<SignedOut>` — use `<Show when="signed-in">` / `<Show when="signed-out">` instead.
- Drizzle ORM with `@neondatabase/serverless` HTTP driver. `src/db/index.ts` exports `db`, schema in `src/db/schema.ts` (one `interest` table — placeholder). `drizzle.config.ts` loads `.env.local` via `dotenv`.
- Ran `pnpm db:push` — `interest` table created in Neon. Confirms DB connectivity.
- Landing page (`src/app/page.tsx`): minimal "Founder Festival / festival.so" hero with sign-in/sign-up modal buttons (signed-out) or UserButton + "Go to dashboard" link (signed-in).
- Protected page (`src/app/dashboard/page.tsx`): greets the user by first name via `currentUser()`.
- `pnpm build` succeeds locally.

### Potential concerns to address:
- **Domain not yet pointed.** `festival.so` is registered but not added to Vercel and Cloudflare DNS records aren't created. Need to add the domain in Vercel and create the Cloudflare records (A → 76.76.21.21 for apex, CNAME → cname.vercel-dns.com for www) with proxy **OFF** so Vercel can serve directly.
- **Vercel CLI is on 53.2.0; latest is 54.2.0.** Upgrade with `pnpm add -g vercel@latest` for newer agentic features.
- **Clerk `<Show>` is the v7 replacement for `<SignedIn>`/`<SignedOut>`.** Most LLM-suggested snippets will use the v6 components and won't compile — flag this for future agents.
- **`next/font/google` was removed.** During local build the Google Fonts fetch failed (likely sandbox network). The build now relies on the system font stack via Tailwind's `font-sans`. If you want Geist back, install `geist` as an npm package or use `next/font/local`.
- **`interest` table is unused.** It's pushed to Neon as a smoke test for DB connectivity but no UI writes to it. Either wire it up to a waitlist form or drop it before launch.
- **Build scripts blocked.** `@clerk/shared` and `esbuild` postinstall scripts are ignored under pnpm. Run `pnpm approve-builds` if you hit Clerk runtime issues.
- **No tests yet.** No vitest/playwright config — add before the codebase grows.
