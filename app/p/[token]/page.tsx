import type { Metadata } from "next";
import { ProfileView } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A Pixel Parents profile",
  description:
    "A family in the Pixel Parents community — OHS parents building software for our kids.",
  // A secret link should never be indexed.
  robots: { index: false, follow: false },
  openGraph: {
    title: "A Pixel Parents profile",
    description:
      "A family in the Pixel Parents community — OHS parents building software for our kids.",
    type: "profile",
    // A page-level openGraph doesn't inherit the root file-based image, so set it.
    images: ["/opengraph-image.png"],
  },
  twitter: { card: "summary_large_image", images: ["/opengraph-image.png"] },
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
