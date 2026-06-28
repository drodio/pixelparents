# host-sponsor-image-sizing

## Progress Update as of 2026-06-12 10:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(A) Admin hosts/sponsors list logos ~3× wider (w-10 → w-32). (B) Public sponsor
page logo now uses the SAME structure + size as the host page logo.

### Detail of changes made:
- `src/components/admin/HostsManager.tsx`: list logo `h-10 w-10 object-cover` →
  `h-10 w-32 object-contain` (3.2× wider; object-contain so the wider box doesn't
  crop); fallback div widened to w-32.
- `src/components/admin/SponsorsManager.tsx`: list logo `w-10` → `w-32` (kept
  object-contain + bg-white/5); fallback widened.
- `src/app/(authed)/sponsors/[slug]/page.tsx`: sponsor logo
  `h-40 w-40 sm:h-48 sm:w-48 rounded-2xl bg-white/5 object-contain p-3` →
  `w-4/5 h-auto rounded-2xl object-contain` (matches the host page exactly);
  fallback → `aspect-square w-4/5 rounded-2xl bg-zinc-800`.

### Potential concerns to address:
- Sponsor logos now have no white background/padding (matching hosts per request);
  dark-on-transparent logos rely on the page bg like host icons do.
