import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only the admin area is gated. The public coming-soon splash stays open and
// never boots Clerk JS (ClerkProvider is scoped to the (authed) route group,
// not the root layout — see app/(authed)/layout.tsx).
const isProtectedRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    // Redirects unauthenticated visitors to the sign-in page.
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
