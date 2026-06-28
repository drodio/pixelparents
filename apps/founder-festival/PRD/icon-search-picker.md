# PRD — icon-search-picker

## Progress Update as of 2026-06-06 10:48 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Added a shared icon/logo picker to the admin Hosts and Sponsors
editors with three ways to set the image: drag-and-drop, click-to-upload, and
web-search-and-pick (Exa). Picking a search result copies the remote image into
our own Vercel Blob (never hot-linked).

### Detail of changes made:
- `src/components/admin/IconPicker.tsx` (new): preview + drag-drop/click upload
  zone + "Search the web for a logo" box (seeded with the entity name) → grid of
  candidate images → click to set. POSTs to the per-entity endpoint (file via
  FormData, or picked result via JSON { imageUrl }); calls onChange(url).
- `src/app/api/admin/icon-search/route.ts` (new): GET ?q= → Exa search "<q> logo"
  → collects each result's representative `image` (then `favicon` as fallback),
  de-duped, capped at 12. Gated on `manage_events`. Verified: Exa returns ~9/10
  results with images for logo queries.
- `src/lib/icon-blob.ts` (new): `storeImageFromUrl(prefix, url)` — fetch, validate
  (image content-type, ≤5MB), `put()` to Blob; returns public URL.
- `src/app/api/admin/hosts/[id]/icon/route.ts` + `.../sponsors/[id]/logo/route.ts`:
  now accept EITHER a file (multipart, as before) OR JSON { imageUrl } (copied via
  storeImageFromUrl). Both also return a generic `url` alongside iconUrl/logoUrl.
- `HostEditor.tsx` / `SponsorEditor.tsx`: replaced the bare file input with
  `<IconPicker>` (host fit=cover, sponsor fit=contain); removed the old
  uploadIcon/uploadLogo + fileRef.

### Verification done:
- `next build` compiles + typechecks; `/api/admin/icon-search` route registered.
- Exa sanity: "Stripe logo" 9/10 images, "Agate Hound logo" 9/10 images.

### Potential concerns to address:
- Exa images are page-preview images (mixed quality) — agreed tradeoff; the
  upgrade path to a dedicated image-search API is isolated to the icon-search route.
- Picked images are copied into Blob with a generic `searched.<ext>` name; no
  client-side crop/resize (admins pick a good source).
