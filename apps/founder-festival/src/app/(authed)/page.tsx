import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { tryAutoClaim } from "@/lib/auto-claim";
import { isUuid } from "@/lib/canonicalize";
import { CLAIM_EVAL_COOKIE } from "@/lib/claim-cookie";
import { SplashHome } from "@/components/SplashHome";

type PageProps = {
  searchParams: Promise<{ home?: string }>;
};

// Signed-in users who've already claimed an evaluation skip the splash and
// land on their /profile page directly. Everyone else (signed out, signed in
// but unclaimed) sees the splash so they can score themselves.
//
// EXCEPTION: when the URL carries `?home=1` the redirect is suppressed —
// that's the signal the in-app Founder Festival logo passes when a signed-in
// user clicks it (they explicitly want to see the splash/home, not their
// own profile page).
//
// AUTO-CLAIM: a signed-in user with NO claim row but a Clerk identity that
// matches an existing eval (GitHub username, LinkedIn URL, verified email)
// gets auto-claimed inline and redirected to their profile. Saves the
// "you authenticated via GitHub but ended up on the splash" dead end when
// the /claim/callback redirect chain loses the ?e=<uuid> query param.
export default async function Home({ searchParams }: PageProps) {
  const { home } = await searchParams;
  const wantsHome = home === "1";
  if (!wantsHome) {
    const { userId } = await auth();
    if (userId) {
      const [row] = await db
        .select({ evaluationId: users.evaluationId })
        .from(users)
        .where(eq(users.clerkUserId, userId))
        .limit(1);
      if (row?.evaluationId) {
        redirect(`/profile?e=${row.evaluationId}`);
      }
      // No claim yet — try auto-claim from the Clerk identity.
      const user = await currentUser().catch(() => null);
      if (user) {
        const matched = await tryAutoClaim(userId, user);
        if (matched) redirect(`/profile?e=${matched.evaluationId}`);
      }
      // Last-resort backstop: Clerk's OAuth redirect can dump a just-claiming
      // user here with the ?e= dropped. If they stashed a claim target before
      // the round-trip, finish the claim now instead of stranding them on the
      // splash. /claim/callback consumes + clears the cookie.
      const claimTarget = (await cookies()).get(CLAIM_EVAL_COOKIE)?.value ?? null;
      if (isUuid(claimTarget)) {
        redirect(`/claim/callback?e=${claimTarget}&return=welcome`);
      }
    }
  }
  return <SplashHome />;
}
