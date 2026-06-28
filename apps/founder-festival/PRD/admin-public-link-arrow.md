# Admin event links → boxed diagonal-arrow icons

## Progress Update as of 2026-06-12 2:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the admin event page, replaced two text links with a boxed external-link (diagonal arrow)
icon: "View public page" → arrow box next to the slug Save button; "View on Luma" → arrow box
next to the "Re-Import from Luma" button.

### Detail of changes made:
- `admin/events/[id]/page.tsx`: removed the "View public page" text row; the slug row is now a
  flex with the slug editor + a bordered `ExternalLinkIcon` link (target=_blank) to the right of
  its Save button.
- `ReimportLumaButton`: "View on Luma ↗" text → a bordered `ExternalLinkIcon` link to the right
  of the button.

### Potential concerns to address:
- None — same destinations (public event page / lu.ma), now icon-only with title/aria-label.
