## Progress Update as of July 9, 2026 — 2:33 PM Pacific

### Summary of changes since last update
First entry. Rebrands the app from Pixel Parents (pixelparents.org) to GoPixel
(gopixel.org) as part of the domain move. Mechanical global replace across 109
text files: pixelparents.org → gopixel.org, "Pixel Parents"/"PixelParents" →
"GoPixel". tsc / lint / 869 tests / build all green. STAGED — do not merge until
the Clerk auth cutover (below) is done, or production auth on gopixel.org breaks.

### Detail of changes made:
- Global replace over app/ components/ lib/ public/ (text files only via rg -l0 |
  xargs, so no binaries/assets touched). Patterns were case/format-specific, so
  identifiers were preserved: the pixel-mascot.png asset, the "pp-" localStorage/
  CSS prefixes, the lowercase package name, and the drodio/pixelparents repo path
  are all UNCHANGED.
- Key config now points at the new brand/domain: lib/url.ts fallback →
  https://gopixel.org; lib/email.ts FROM/VERIFY_FROM → "GoPixel <…@gopixel.org>";
  manifest name/short_name, OG/twitter cards, page titles, all copy → GoPixel.
- Fixed one slugify unit test whose sample input was the brand string.

### Infra already done OUTSIDE this PR (live):
- gopixel.org + www.gopixel.org added to the Vercel project; Cloudflare DNS
  repointed (apex + www CNAME → cname.vercel-dns.com, DNS-only/grey-cloud so Vercel
  manages SSL). Both serve the app over HTTPS (HTTP/2 200), SSL issued. MX/SPF
  email records on gopixel.org left intact.

### Potential concerns to address (BLOCKERS for cutover):
- CLERK: production instance (pk_live) with Frontend API at clerk.pixelparents.org.
  Auth is tied to pixelparents.org. Before making gopixel.org canonical / redirecting
  the old domain, someone must reconfigure Clerk (add gopixel.org as allowed origin
  / satellite, or migrate the primary domain to gopixel.org + set up clerk.gopixel.org
  DNS). This is a Clerk Dashboard action — cannot be done with the pk/sk keys.
- EMAIL: RESEND_FROM must not switch to @gopixel.org until gopixel.org is verified
  as a Resend sending domain (DKIM/SPF DNS). Otherwise sends fail.
- ENV: set NEXT_PUBLIC_SITE_URL=https://gopixel.org in Vercel (canonical URL for
  share links/OG/emails) as part of the cutover deploy.
- public/sign-in-with-pixelparents.js keeps its filename (content rebranded);
  rename + update references as a follow-up if desired.
