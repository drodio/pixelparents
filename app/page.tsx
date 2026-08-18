import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import InterestTiles from "./signup/interest-tiles";
import { PixelMascot } from "@/components/pixel-mascot";
import { IrlTooltip } from "@/components/irl-tooltip";
import { IconHeart, IconArrowRight } from "@/components/icons";
import ReportDialog from "./report/report-dialog";
import { InstallPrompt } from "@/components/install-prompt";
import { isAdminEmail } from "@/lib/admin";
import {
  getSignupCount,
  getBuilderCounts,
  getStudentBuilderCount,
  getCommunitySplit,
} from "@/lib/db/signups";
import { getInterestPool } from "@/lib/interests";
import { ThemeToggle } from "@/components/theme-toggle";

// Reflect live counts + interests.
export const dynamic = "force-dynamic";

// Top-right corner button (Log in / Admin) — gold, 8px corners (rounded-lg).
const cornerBtnCls =
  "absolute right-4 top-4 z-20 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-amber-300 sm:right-6 sm:top-6";

export default async function Home() {
  let count = 0;
  let interests: string[] = [];
  let builders = { technical: 0, curious: 0 };
  let studentBuilders = 0;
  let split = { parents: 0, students: 0 };
  try {
    [count, interests, builders, studentBuilders, split] =
      await Promise.all([
        getSignupCount(),
        // Completed-only so the "N shared interests" headline (and the mosaic it
        // feeds) matches the other completed-only counts — drafts don't inflate it.
        getInterestPool({ completedOnly: true }),
        getBuilderCounts(),
        getStudentBuilderCount(),
        getCommunitySplit(),
      ]);
  } catch {
    count = 0;
    interests = [];
    builders = { technical: 0, curious: 0 };
    studentBuilders = 0;
    split = { parents: 0, students: 0 };
  }
  // Headline count derives from the SAME distinct pool that feeds the animated
  // mosaic (InterestTiles), so the number a visitor reads can never be smaller
  // than the set of interests actually swirling on screen. getInterestPool()
  // already unions parent_interests + children.interests and de-dupes.
  const interestsCount = interests.length;

  // Read auth server-side so the public splash never loads Clerk JS. auth() is a
  // cheap cookie read; only fetch the full user (a Clerk API call) when signed
  // in, so logged-out visitors — the common case here — pay nothing extra.
  let signedIn = false;
  let isAdmin = false;
  try {
    const { userId } = await auth();
    signedIn = Boolean(userId);
    if (userId) {
      const user = await currentUser();
      isAdmin = await isAdminEmail(user?.primaryEmailAddress?.emailAddress);
    }
  } catch {
    signedIn = false;
    isAdmin = false;
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-black px-4 py-10 text-center sm:px-6 sm:py-12">
      <InterestTiles interests={interests} variant="fade" />
      {/* Amber brand wash behind the mosaic so the background subtly pulses in
          brand color rather than reading as a flat grayscale field. Pure CSS,
          pointer-events-none, sits above the (z-0) mosaic but below content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[60vh] bg-[radial-gradient(60%_70%_at_50%_-10%,rgba(245,158,11,0.16),transparent_70%)]"
      />

      {/* Theme toggle on the PUBLIC landing too, not just behind auth: a parent
          who can't read the dark UI has to be able to fix that before they've
          signed in, otherwise the control is behind the wall it's needed for. */}
      <div className="absolute left-4 top-4 z-20 sm:left-6 sm:top-6">
        <ThemeToggle />
      </div>

      {isAdmin ? (
        // Signed-in admins get a quick link into the admin area.
        <Link href="/admin" className={cornerBtnCls}>
          Admin
        </Link>
      ) : signedIn ? null : (
        // Logged-out visitors get a Log in button → /dashboard after sign-in.
        <Link href="/sign-in?redirect_url=/dashboard" className={cornerBtnCls}>
          Log in
        </Link>
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5">
        <PixelMascot widthClass="w-48 max-w-[80vw] sm:w-64" />
        {/* "Join 33" read as ambiguous — 33 what? (Aug 18 walkthrough). Say
            what the number counts, and break it down underneath. */}
        <h1 className="max-w-3xl text-balance text-3xl font-bold tracking-tight text-white sm:text-6xl">
          Join{" "}
          <span className="text-amber-400">{count.toLocaleString()}</span> other
          community members in the Stanford OHS community
        </h1>
        <h2 className="max-w-prose text-pretty text-base font-medium text-white/70 sm:text-xl">
          <span className="font-semibold text-white/85">
            {split.parents.toLocaleString()} {split.parents === 1 ? "parent" : "parents"}
          </span>{" "}
          and{" "}
          <span className="font-semibold text-white/85">
            {split.students.toLocaleString()} {split.students === 1 ? "student" : "students"}
          </span>
          , connecting around{" "}
          <span className="font-semibold text-amber-400">
            {interestsCount.toLocaleString()}
          </span>{" "}
          shared interests, <IrlTooltip />
        </h2>
        {signedIn ? (
          <Link
            href="/dashboard"
            className="group mt-1 inline-flex items-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 text-base font-semibold text-black shadow-lg shadow-amber-400/20 transition-all hover:bg-amber-300 hover:shadow-amber-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] motion-reduce:transition-none"
          >
            Open dashboard
            <IconArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        ) : (
          <Link
            href="/signup"
            className="group mt-1 inline-flex items-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 text-base font-semibold text-black shadow-lg shadow-amber-400/20 transition-all hover:bg-amber-300 hover:shadow-amber-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] motion-reduce:transition-none"
          >
            Join GoPixel free
            <IconArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        )}

        {/* Affiliation disclaimer. Lives on the HOME page (not just /terms and
            /privacy) at the request of an OHS staff contact — it was the single
            change he asked for. Kept warm rather than legalistic per Daniel, but
            the operative phrase ("not affiliated with or endorsed by") matches
            the legal pages verbatim so the three can't drift. */}
        <p className="mt-6 max-w-xl text-balance text-center text-sm text-white/55">
          A side project, not an official one. Made by OHS families on nights and
          weekends, and{" "}
          <span className="font-semibold text-white/70">
            not affiliated with or endorsed by
          </span>{" "}
          Stanford University or Stanford OHS. We just really like this school.
        </p>
      </div>

      <footer className="relative z-10 mt-8 text-center text-sm text-white/50">
        Created with{" "}
        <IconHeart className="inline-block h-4 w-4 -translate-y-px text-red-400" title="love" />{" "}
        by <span className="text-amber-400">{builders.technical.toLocaleString()}</span>{" "}
        technical {builders.technical === 1 ? "parent" : "parents"},{" "}
        <span className="text-amber-400">{builders.curious.toLocaleString()}</span>{" "}
        non-technical {builders.curious === 1 ? "parent" : "parents"} learning to
        become builders
        {studentBuilders > 0 && (
          <>
            , and{" "}
            <span className="text-amber-400">
              {studentBuilders.toLocaleString()}
            </span>{" "}
            OHS {studentBuilders === 1 ? "student" : "students"}
          </>
        )}
        .{" "}
        <Link
          href="/builders"
          className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
        >
          Learn more about us
        </Link>
        .{" "}
        <Link
          href="/builders#student-builders"
          className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
        >
          Become a student builder
        </Link>
        .
        {/* Legal + report row: tasteful, on-theme footer beneath the credits. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/40">
          <ReportDialog />
          <span aria-hidden="true">·</span>
          <Link
            href="/changelog"
            className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
          >
            Changelog
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/privacy"
            className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/terms"
            className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 transition-colors hover:text-amber-300"
          >
            Terms of Service
          </Link>
        </div>
      </footer>

      {/* Mobile-only "Add to home screen" banner (self-gates: hides on desktop,
          when already installed, or after dismissal). */}
      <InstallPrompt />
    </main>
  );
}
