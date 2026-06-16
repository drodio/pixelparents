import { ClerkProvider } from "@clerk/nextjs";

// ClerkProvider is scoped to this route group (mirrors founder-festival) so the
// public coming-soon splash never loads Clerk JS or triggers the dev-instance
// handshake redirect. Clerk only boots on /sign-in and /admin, which live here.
//
// Route groups don't change URLs: app/(authed)/admin -> /admin,
// app/(authed)/sign-in -> /sign-in. The proxy.ts matcher protects /admin only,
// leaving /sign-in publicly reachable while still inside the provider.
export default function AuthedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
