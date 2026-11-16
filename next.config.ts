import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/blog/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
  async redirects() {
    return [
      // Canonicalize www -> apex (308 permanent), handled at the Vercel edge.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.pixelparents.org" }],
        destination: "https://pixelparents.org/:path*",
        permanent: true,
      },
      // The "Asks" board became the bidirectional "Exchange". Redirect the old
      // route (and any sub-path) so bookmarks / links keep working.
      { source: "/asks", destination: "/community", permanent: true },
      { source: "/asks/:path*", destination: "/community/:path*", permanent: true },
      { source: "/exchange", destination: "/community", permanent: true },
      { source: "/exchange/:path*", destination: "/community/:path*", permanent: true },
    ];
  },
};

export default withBotId(nextConfig);
