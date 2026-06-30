import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail } from "@/lib/admin";
import { getSignupByEmail } from "@/lib/db/signups";
import { getStats } from "@/lib/db/aggregates";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { DashboardShell } from "@/components/dashboard-shell";
import { SignedOutPanel } from "@/components/signed-out-panel";
import {
  IconUsers,
  IconCode,
  IconCircleCheck,
  IconGradCap,
  IconBan,
  IconArrowRight,
} from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — Pixel Parents",
  robots: { index: false, follow: false },
};

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-2xl font-semibold tracking-tight text-amber-400">
        {(value ?? 0).toLocaleString()}
      </div>
      <div className="mt-0.5 text-sm text-white/55">{label}</div>
    </div>
  );
}

function LinkCard({
  href,
  title,
  desc,
  Icon,
  external = false,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-amber-400/40 hover:bg-white/[0.05]"
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
            Reach out to a Pixel Parents admin if you think this is a mistake.
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
  const [signup, isAdmin, stats] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
    getStats(),
  ]);

  const firstName = signup?.firstName ?? user.firstName ?? null;
  const status: ApprovalStatus | null = signup
    ? readApprovalStatus((signup.extra ?? {}) as Record<string, unknown>)
    : null;

  return (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {firstName ? `Welcome back, ${firstName}.` : "Welcome to Pixel Parents."}
        </h1>
        <p className="mt-1 text-sm text-white/55">Your Pixel Parents home base.</p>
      </header>

      <div className="flex flex-col gap-8">
        {signup ? (
          <VerificationCard status={status ?? "pending"} />
        ) : (
          <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <IconGradCap className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-white">Join Pixel Parents</h2>
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
              desc="Browse OHS families and students who are sharing, plus a map of where we're building."
              Icon={IconUsers}
            />
            <LinkCard
              href="/developers"
              title="Developers"
              desc="Build on the Pixel Parents API — request a key and read the docs."
              Icon={IconCode}
            />
          </div>
        </section>

        {stats.database === "ready" && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
              Community at a glance
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Families" value={stats.total_families} />
              <StatTile label="Parents" value={stats.total_signups} />
              <StatTile label="Kids at OHS" value={stats.total_children} />
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
