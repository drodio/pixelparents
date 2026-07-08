## Progress Update as of July 8, 2026 — 4:20 AM Pacific

### Summary of changes since last update
First entry. Adds a directory **perspective toggle** (Parents / Students) per the
product decision that "students see students as primary, parents see parents as
primary, with a toggle to switch." The default side is the VIEWER's own kind (a
student viewer lands on Students, a parent/non-family viewer on Parents); either
can flip it. tsc / lint / build green.

### Detail of changes made:
- `app/(authed)/directory/page.tsx`: computes `viewerIsStudent = isStudentAccount(viewerSignup)`
  (false for non-family viewers) and threads it to `ShowcaseClient` at all three
  render sites (inline, streamed `ThumbnailedShowcase`, and the Suspense fallback).
- `app/(authed)/directory/showcase-client.tsx`: new `viewerIsStudent` prop +
  `perspective` state (default = viewer's kind, but falls back to the populated
  side if the viewer's own side is empty so the grid is never blank on load). The
  `visible` memo filters `c.isStudent === (perspective === "students")`. A segmented
  Parents/Students toggle with live counts sits atop the controls; it hides when
  one side is empty (nothing to switch to).

### Potential concerns to address:
- The toggle is a view preference and is NOT persisted to the URL (unlike search/
  sort/interest filters). Easy to add to `directory-filters` if a shareable link
  should preserve it.
- "Primary" is implemented as a hard filter (show one kind at a time) rather than
  a sort that interleaves both — matches "toggle to switch between parents/students."
  If you'd prefer both shown with the viewer's kind sorted first, say so.
- Bidirectional family mapping (siblings/relatives discovery) from the original
  decision is being handled in the separate profile PR (F), since that's where a
  visitor would traverse family links.
