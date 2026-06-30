import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pixelparents.org"),
  title: "Pixel Parents",
  description:
    "Parents building software to improve the experience for Stanford OHS students.",
  openGraph: {
    title: "Pixel Parent Tech: Join our Builder Community",
    description:
      "Parents building software to improve the experience for Stanford OHS students.",
    siteName: "Pixel Parents",
    url: "https://pixelparents.org",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pixel Parent Tech: Join our Builder Community",
  },
};

// viewport-fit=cover lets the app draw into the iOS safe-area insets so the
// mobile bottom tab bar can pad itself above the home indicator (env(safe-area-*)
// is only populated when cover is set). themeColor matches the dark app base so
// the browser chrome blends in. Scaling is left at the platform default (users
// can still pinch-zoom — we never disable it).
export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
