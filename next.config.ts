import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
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
      { source: "/asks", destination: "/exchange", permanent: true },
      { source: "/asks/:path*", destination: "/exchange/:path*", permanent: true },
    ];
  },
};

export default withBotId(nextConfig);
