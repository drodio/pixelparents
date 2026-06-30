// Standalone dark shell for the OAuth consent + error screens. These live OUTSIDE
// the (authed) route group (so they don't pull the dashboard chrome), and the
// root <body> has no background of its own, so we set the dark base here. No
// ClerkProvider is needed: the pages read the session server-side via auth() and
// bounce to /sign-in (which lives in the authed group) when signed out.
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-black text-white">{children}</div>;
}
