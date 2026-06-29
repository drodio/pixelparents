import type { MetadataRoute } from "next";

// Generates /robots.txt. Keeps the public marketing + docs pages crawlable while
// steering bots away from the app's internal/authenticated surfaces and the
// dev-only preview gallery.
//
// Note on /p/<token> (secret share pages): these are intentionally NOT listed
// here. They already send `robots: { index: false }` per-page (see
// app/p/[token]/page.tsx), which is the stronger guarantee — a Disallow would
// stop crawlers from ever reading that noindex, and listing "/p" in this public
// file would advertise the secret-link feature path. Rely on the per-page
// noindex instead.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin", // admin panel
          "/account", // developer API-key management
          "/api/", // API endpoints — no SEO value
          "/signup/thanks", // private per-signup edit page (carries ?id=)
          "/sign-in", // Clerk auth UI
          "/preview", // dev-only status-screen gallery
        ],
      },
    ],
    // No sitemap yet — add one (app/sitemap.ts) and reference it here when the
    // public page set stabilizes.
  };
}
