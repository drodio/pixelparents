import { ClerkProvider } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { profileUrlFor } from "@/lib/profile-slug";
import { isAdmin } from "@/lib/admin";
import { UserBadge } from "@/components/UserBadge";
import { MembershipBanner } from "@/components/MembershipBanner";
import { PostHogIdentify } from "@/components/PostHogIdentify";

// ClerkProvider is scoped to this route group so the splash, leaderboard,
// chatham, privacy, and /verified pages do NOT load Clerk JS. That avoids
// the dev-instance "dev-browser-missing" handshake redirect on fresh
// incognito visits — the splash works for everyone, and Clerk JS only
// boots when the user lands on /profile or /claim.
//
// UserBadge is mounted as a fixed floating element so the account avatar +
// sign-out is visible on every page (splash, /chatham, /privacy, /profile).
//
// The yellow "complete your membership" banner shows on every page when the
// signed-in user is missing a primary email or phone. Same gating as the
// claim/callback `needsSetup` check so the banner stays in sync with the
// post-claim redirect behavior.
export default async function AuthedLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser().catch(() => null);
  const needsSetup =
    user != null &&
    (user.primaryEmailAddressId == null || user.primaryPhoneNumberId == null);
  // Admins get an "Admin" shortcut next to their profile (mirrors the splash's
  // "Developers" button). Non-admins / signed-out users see nothing extra.
  const admin = await isAdmin().catch(() => false);

  // Look up the signed-in user's claimed evaluation so the UserBadge
  // dropdown can add a "View My Public Profile" menu item with the
  // canonical URL (/profile/<username> if Clerk username set, else
  // /profile/<kind>/<slug>, else legacy /profile?e=<id>).
  const { userId: clerkUserId } = await auth();
  let profileHref: string | null = null;
  if (clerkUserId) {
    const [row] = await db
      .select({
        evaluationId: users.evaluationId,
        clerkUsername: users.clerkUsername,
        slug: evaluations.slug,
        slugKind: evaluations.slugKind,
      })
      .from(users)
      .leftJoin(evaluations, eq(evaluations.id, users.evaluationId))
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);
    if (row?.evaluationId) {
      profileHref = profileUrlFor({
        evalId: row.evaluationId,
        clerkUsername: row.clerkUsername,
        slug: row.slug,
        slugKind: row.slugKind,
      });
    }
  }

  return (
    <ClerkProvider afterSignOutUrl="/">
      <PostHogIdentify />
      {/* Admins (e.g. users who arrived via the admin accept-invite flow) are
          exempt — they don't need the member email+phone setup, so the banner
          would just be noise for them. */}
      <MembershipBanner needsSetup={needsSetup && !admin} />
      {/* On mobile the chrome flows as a normal row at the top of every
          (authed) page so the Log in pill / avatar never sits ON TOP of
          scrolling content (leaderboard cards used to slide under it).
          Desktop keeps the original fixed top-right placement so it's
          available without scrolling back up. */}
      <div className="z-50 flex items-center justify-end gap-3 px-4 pt-3 sm:p-0 sm:fixed sm:top-3 sm:right-4">
        {admin && (
          <a
            href="/admin"
            className="text-sm text-zinc-300 hover:text-white px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-500 bg-zinc-900/70 backdrop-blur-sm"
          >
            Admin
          </a>
        )}
        <UserBadge profileHref={profileHref} />
      </div>
      {children}
    </ClerkProvider>
  );
}
