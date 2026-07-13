import { renderOgCard } from "@/lib/og-card";

// DYNAMIC social card, rendered at REQUEST time so the family count is always
// current as new families complete signup. The render lives in lib/og-card so
// twitter-image can share it; the route-segment config below MUST be declared
// here as literals (Next's analyzer can't trace it through a re-export).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const alt = "GoPixel — Parents helping OHS students build what they wish existed.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgCard();
}
