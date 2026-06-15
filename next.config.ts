import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
