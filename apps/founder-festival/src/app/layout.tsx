import type { Metadata, Viewport } from "next";
import { Spectral, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

// ClerkProvider is no longer in the root layout — it lives in
// src/app/(authed)/layout.tsx so it only loads on routes that actually need
// auth. Public routes (splash, leaderboard, chatham, privacy, verified)
// don't trigger Clerk's dev-browser handshake on first visit.

const spectral = Spectral({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Explicit viewport so iPhones render at device width with no initial zoom.
// Next's default omitted initial-scale; user zoom stays enabled for a11y.
// themeColor matches the body bg so mobile browser chrome blends in.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#151515",
};

export const metadata: Metadata = {
  // metadataBase resolves relative URLs (e.g. OG images) to absolute when
  // crawlers fetch the page. Without this, social platforms can't resolve
  // /api/og?e=… to a fetchable URL.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://festival.so",
  ),
  title: "Founder Festival",
  description: "Intimate pop-up IRL events for venture-backed founders and investors.",
  openGraph: {
    title: "Founder Festival",
    description: "Intimate pop-up IRL events for venture-backed founders and investors.",
    images: ["/images/founder-festival-icon-small.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Founder Festival",
    description: "Intimate pop-up IRL events for venture-backed founders and investors.",
    images: ["/images/founder-festival-icon-small.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#151515] font-sans">
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
