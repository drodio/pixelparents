import { renderOgCard } from "@/lib/og-card";

// Twitter card. Standalone route (NOT a re-export of opengraph-image — Next's
// metadata-route analyzer can't trace the route-segment config through a
// re-export, which breaks the Turbopack build). Shares only the render fn.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const alt = "GoPixel — Parents helping OHS students build what they wish existed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard();
}
