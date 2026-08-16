import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { PostHogProvider } from "@/components/posthog-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gopixel.org"),
  title: "GoPixel",
  description:
    "Parents building software to improve the experience for Stanford OHS students.",
  // PWA install manifest (name, icons, standalone display, start_url:/dashboard).
  manifest: "/manifest.webmanifest",
  // iOS "Add to Home Screen" web-app config: capable + title + translucent status
  // bar so the standalone app draws under the notch (paired with viewportFit).
  appleWebApp: {
    capable: true,
    title: "GoPixel",
    statusBarStyle: "black-translucent",
  },
  // Apple touch icon for the iOS home-screen tile (amber "P" on ink).
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "GoPixel: Join our Builder Community",
    description:
      "Parents building software to improve the experience for Stanford OHS students.",
    siteName: "GoPixel",
    url: "https://gopixel.org",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GoPixel: Join our Builder Community",
  },
};

// viewport-fit=cover lets the app draw into the iOS safe-area insets so the
// mobile bottom tab bar can pad itself above the home indicator (env(safe-area-*)
// is only populated when cover is set). themeColor matches the dark app base so
// the browser chrome blends in. Scaling is left at the platform default (users
// can still pinch-zoom — we never disable it).
export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
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
      // Set before paint by the script below. The attribute is declared here so
      // the very first frame already has a theme rather than inheriting one.
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/*
          Theme, applied BEFORE first paint.

          This has to be a blocking inline script. Doing it in an effect means
          the browser paints the dark UI first and then repaints light — a flash
          of exactly the thing a light-mode member switched away from, on every
          single navigation.

          A stored choice always wins. With nothing stored we follow the OS,
          which is the point: a parent whose laptop is in light mode gets a
          readable site without having to discover a toggle first.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('gopixel-theme');var t=s==='light'||s==='dark'?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
        {/* Product analytics (no-op without NEXT_PUBLIC_POSTHOG_KEY). */}
        <PostHogProvider />
      </body>
    </html>
  );
}
