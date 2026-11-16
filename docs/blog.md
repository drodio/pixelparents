# Unlisted blog posts

Admins open **Admin → Blog** (`/admin/blog`) to create or edit posts. Save as a
draft while writing, preview the Markdown, then check **Published** and save.
The post list shows its reading link; open it to copy the full URL, or use the
browser's Copy link action. Readers need no account.

Photos: `![A useful photo description](https://example.test/photo.jpg)`.
Video: `[Video title](https://www.youtube.com/watch?v=abcdefghijk)` or a Vimeo
video URL or an HTTPS MP4/WebM/OGG URL. Media must be accessible to readers;
this editor embeds URLs and does not upload files. Raw HTML is disabled.

Anyone with the random link can read and forward it. Posts have no public
listing and send no-index/no-follow/no-archive metadata. Reading responses are
not cached, and readers send no referrer to embedded media. Blog/editor
analytics events are suppressed to keep capability URLs and drafts out of
PostHog. External media providers still receive requests when media loads.

To revoke a link, uncheck **Published** and save. To replace it, check **Replace
secret link** and save; the old URL then returns 404. Drafts also return 404.
Admin authorization is checked in both the page and every save action.

The `blog_posts` Drizzle schema is exported through the schema barrel. Its
self-healing DDL creates the table and unique token index on first use, following
the changelog convention; no manual database push is required.
