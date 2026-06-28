# admin-event-onepage

## Progress Update as of 2026-06-08 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged the separate `/admin/events/[id]/recap` page into the main
`/admin/events/[id]` page, so applicant management and all recap/content editing
(hosts, sponsors, photos, priorities, learnings) live on one page. The applicant
queue now caps at the first 10 rows with a "Load more" button.

### Detail of changes made:
- `src/app/(authed)/admin/events/[id]/page.tsx`: now fetches recap data
  (`getEventPhotos`, `listHosts`/`getHostsForEvent`, `listSponsors`/
  `getSponsorsForEvent`, `getEventPriorities`) in the same `Promise.all` as the
  applicant queue. Renders two stacked blocks: the applicant queue (unchanged
  logic) and a new "Recap & content" block with Hosts / Sponsors / Photos /
  Event priorities / Learnings sections. Removed the old "📸 Recap & content →"
  header link.
- `src/components/admin/ApplicantRowsExpander.tsx` (new): client wrapper rendered
  inside `<tbody>`. Receives the already-built `<ApplicantRow>` elements as a
  `rows` prop, shows the first 10, and renders a "Load more (N more)" row that
  reveals the rest. Per-row interactivity is preserved because the rows are the
  same client elements, just conditionally rendered.
- `src/app/(authed)/admin/events/[id]/recap/page.tsx`: replaced the full editor
  with a permanent `redirect(/admin/events/[id])` so old bookmarks/links don't
  404. (No remaining in-app links point to `/recap`.)

### Potential concerns to address:
- The applicant queue still fetches up to 200 for the current status and 1000
  per status for the count badges; "Load more" is purely a client-side reveal of
  already-fetched rows, not a paginated fetch. Fine at current event sizes.
- Recap editors (hosts/sponsors/photos/learnings) each have their own save
  buttons; only the priorities editor auto-saves (see priorities-autosave / PR
  #251). If the user wants uniform auto-save UX, the others would need the same
  treatment.
- The page is now long. Consider in-page anchor nav or collapsible sections if it
  grows further.
