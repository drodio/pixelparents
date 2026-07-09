import type { Metadata } from "next";
import { ProfileView } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A GoPixel profile",
  description:
    "A family in the GoPixel community — OHS parents building software for our kids.",
  // A secret link should never be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "A GoPixel profile",
    description:
      "A family in the GoPixel community — OHS parents building software for our kids.",
    type: "profile",
    // Deliberately NO `images` here: the OG card is a DYNAMIC file-based route
    // (app/opengraph-image.tsx → /opengraph-image/<hash>), never a static
    // /opengraph-image.png. Omitting `images` lets this page inherit the root
    // segment's auto-generated, correctly-hashed dynamic card instead of
    // pointing at a .png that 404s and breaks the share preview.
  },
  twitter: { card: "summary_large_image" },
};

// The public secret share page. Renders the shared ProfileView in its full-bleed
// "public" variant; the SAME component powers the in-dashboard /directory/<token>
// view ("dashboard" variant), so the two can never drift.
export default async function SharedProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ProfileView token={token} variant="public" />;
}
