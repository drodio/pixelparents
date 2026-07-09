import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getSignupByEmail } from "@/lib/db/signups";
import { getStats, getBreakdowns } from "@/lib/db/aggregates";
import { getSharedInterestMatches } from "@/lib/db/interest-matches";
import { isFamilyVerified } from "@/lib/directory";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { SharedInterests } from "./shared-interests";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import { CountUp } from "./count-up";
import { CommunityPulse } from "./community-pulse";
import {
  IconHeart,
  IconUsers,
  IconHome,
  IconCode,
  IconCalendar,
  IconBook,
  IconCircleCheck,
  IconGradCap,
  IconBan,
  IconArrowRight,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — GoPixel",
  robots: { index: false, follow: false },
};

function StatTile({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number | null;
  Icon: (p: { className?: string }) => React.ReactElement;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-amber-400/30 sm:p-4">
      <span className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
        <CountUp value={value ?? 0} />
      </div>
      <div className="mt-1 h-0.5 w-6 rounded-full bg-amber-400/70" aria-hidden />
      <div className="mt-1.5 text-xs text-white/60 sm:text-sm">{label}</div>
    </div>
  );
}

function LinkCard({
  href,
  title,
  desc,
  Icon,
  external = false,
  tourId,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  external?: boolean;
  // When set, the card carries a data-tour attribute so the walkthrough tour can
  // spotlight it one at a time.
  tourId?: string;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(tourId ? { "data-tour": tourId } : {})}
      className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/40 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-amber-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)] active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          {title}
          <IconArrowRight className="h-4 w-4 -translate-x-1 text-white/30 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-sm text-white/55">{desc}</span>
      </span>
    </Link>
  );
}

function VerificationCard({ status }: { status: ApprovalStatus }) {
  if (status === "approved") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-5">
        <IconCircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
        <div>
          <h2 className="font-semibold text-white">Your family is verified</h2>
          <p className="mt-0.5 text-sm text-white/65">
            You have full access to the OHS family directory and community.
          </p>
        </div>
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/[0.07] p-5">
        <IconBan className="mt-0.5 h-6 w-6 shrink-0 text-red-300" />
        <div>
          <h2 className="font-semibold text-white">Your family&apos;s access was declined</h2>
          <p className="mt-0.5 text-sm text-white/65">
            Reach out to a GoPixel admin if you think this is a mistake.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-5">
      <IconGradCap className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-white">Verify your OHS student</h2>
        <p className="mt-0.5 text-sm text-white/65">
          Confirm your student&apos;s Stanford email to unlock the full directory and community.
          It takes about a minute.
        </p>
      </div>
      <Link
        href="/verify"
        className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
      >
        Verify now
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await currentUser();

  // Signed-out: render the grayed shell (locked tabs + sign-in CTA) instead of
  // bouncing to /sign-in. Crucially we return BEFORE touching the DB — no
  // signup/stats/PII is loaded or rendered in this branch.
  if (!user) {
    return (
      <DashboardShell authed={false} firstName={null} email={null} status={null}>
        <SignedOutPanel area="dashboard" />
      </DashboardShell>
    );
  }

  const email = primaryEmail(user);
  const [signup, isAdmin, stats, breakdowns] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
    getStats(),
    getBreakdowns(),
  ]);

  const builderInterest = breakdowns.signups_by_builder_interest ?? {};

  // Auto-matching: families who share the viewer's interests. Gated to a VERIFIED
  // family (the same gate the directory enforces) so we never surface suggestions
  // to — or leak profiles into — a view an unverified account shouldn't see.
  // getSharedInterestMatches internally re-applies isDirectoryVisible to every
  // candidate, so this is defense in depth, not the only gate. Best-effort: []
  // (section hidden) on any failure.
  const interestMatches =
    signup && isFamilyVerified(signup) ? await getSharedInterestMatches(signup) : [];

  const firstName = signup?.firstName ?? user.firstName ?? null;
  const status: ApprovalStatus | null = signup
    ? readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>)
    : null;

  return (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {firstName ? `Welcome back, ${firstName}.` : "Welcome to GoPixel."}
        </h1>
        <p className="mt-1 text-sm text-white/55">Your GoPixel home base.</p>
      </header>

      <div className="flex flex-col gap-8">
        {signup ? (
          <VerificationCard status={status ?? "pending"} />
        ) : (
          <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <IconGradCap className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-white">Join GoPixel</h2>
              <p className="mt-0.5 text-sm text-white/65">
                We don&apos;t have a family signup for this account yet. Sign up to unlock the
                directory and community.
              </p>
            </div>
            <Link
              href="/signup"
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
            >
              Get started
            </Link>
          </div>
        )}

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
            Explore
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <LinkCard
              href="/community"
              title="Community"
              desc="The two-way help board — post an Ask when you need a hand or an Offer when you can give one, and get matched."
              Icon={IconHeart}
              tourId="explore-community"
            />
            <LinkCard
              href="/directory"
              title="Directory"
              desc="Browse OHS families and students who are sharing, plus a map of where we're building."
              Icon={IconUsers}
              tourId="explore-directory"
            />
            <LinkCard
              href="/events"
              title="Events"
              desc="The shared OHS calendar — community-created events alongside the school-year calendar."
              Icon={IconCalendar}
              tourId="explore-events"
            />
            <LinkCard
              href="/resources"
              title="Resources"
              desc="Community resource boards — OHS-only, upvotable collections of links, files, and notes."
              Icon={IconBook}
              tourId="explore-resources"
            />
            <LinkCard
              href="/family"
              title="Family"
              desc="Manage your family profile and your verified OHS students."
              Icon={IconHome}
              tourId="explore-family"
            />
            <LinkCard
              href="/dashboard/developers"
              title="Developers"
              desc="Build on the GoPixel API — request a key and read the docs."
              Icon={IconCode}
              tourId="explore-developers"
            />
          </div>
        </section>

        <SharedInterests matches={interestMatches} />

        {stats.database === "ready" && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
              Community at a glance
            </h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatTile label="Families" value={stats.total_families} Icon={IconHome} />
              <StatTile label="Parents" value={stats.total_signups} Icon={IconUsers} />
              {/* "Children" (not "Kids at OHS"): total_children counts every
                  child of a completed family, including those explicitly marked
                  "Not an OHS child" — so "Kids at OHS" would overstate actual OHS
                  enrollment. Matches the directory stat-strip relabel. */}
              <StatTile label="Children" value={stats.total_children} Icon={IconGradCap} />
            </div>
          </section>
        )}

        {breakdowns.database === "ready" && (
          <CommunityPulse
            topInterests={breakdowns.top_interests}
            builders={{
              builder: builderInterest["builder"] ?? 0,
              aspiring: builderInterest["aspiring"] ?? 0,
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}
