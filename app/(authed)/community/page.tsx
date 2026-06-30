import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { primaryEmail } from "@/lib/clerk";
import { getSignupByEmail } from "@/lib/db/signups";
import { getStats, getBreakdowns, getTrends } from "@/lib/db/aggregates";
import { readApprovalStatus, type ApprovalStatus } from "@/lib/approval";
import { isAdminEmail } from "@/lib/admin";
import { buildMarkers } from "@/lib/community-map";
import { WorldMap } from "@/components/world-map";
import { DashboardShell } from "@/components/dashboard-shell";
import { UnverifiedNotice } from "@/components/unverified-notice";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community — Pixel Parents",
  description: "A bird's-eye view of the Pixel Parents (Stanford OHS) builder community.",
  robots: { index: false, follow: false },
};

// Amber accent, matching the rest of pixelparents.org.
const AMBER = "#fbbf24";
const AMBER_DEEP = "#d97706";

function PageHeader() {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Our community</h1>
      <p className="mt-1 text-sm text-white/55">
        Stanford OHS parents and kids, building together.
      </p>
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">{children}</div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-3xl font-semibold tracking-tight text-amber-400">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-white/55">{label}</div>
    </div>
  );
}

function Pills({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([t, c]) => (
        <span
          key={t}
          className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-sm text-white/85"
        >
          {t} <span className="text-white/35">{c}</span>
        </span>
      ))}
    </div>
  );
}

function BuilderBar({ mix }: { mix: Record<string, number> }) {
  const order: Array<[string, string, string]> = [
    ["builder", "Builders", AMBER],
    ["aspiring", "Aspiring", AMBER_DEEP],
    ["no", "Cheering on", "#4b5563"],
  ];
  const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        {order.map(([k, , color]) => {
          const pct = ((mix[k] ?? 0) / total) * 100;
          return pct > 0 ? <div key={k} style={{ width: `${pct}%`, background: color }} /> : null;
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
        {order.map(([k, label, color]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
            {label} {mix[k] ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: Array<{ cumulative: number }> }) {
  const w = 100;
  const h = 30;
  const max = Math.max(...points.map((p) => p.cumulative), 1);
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p.cumulative / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={AMBER} fillOpacity="0.13" />
      <path d={d} fill="none" stroke={AMBER} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function CommunityPage() {
  // Auth + OHS-family gate — identical to /directory.
  const viewer = await currentUser();
  if (!viewer) redirect("/sign-in");
  const email = primaryEmail(viewer);
  const [viewerSignup, isAdmin] = await Promise.all([
    email ? getSignupByEmail(email) : Promise.resolve(null),
    isAdminEmail(email),
  ]);
  const isOhsFamily = Boolean(viewerSignup);
  const firstName = viewerSignup?.firstName ?? viewer.firstName ?? null;
  const status: ApprovalStatus | null = viewerSignup
    ? readApprovalStatus((viewerSignup.extra ?? {}) as Record<string, unknown>)
    : null;

  const shell = (content: React.ReactNode) => (
    <DashboardShell firstName={firstName} email={email} status={status} isAdmin={isAdmin}>
      {content}
    </DashboardShell>
  );

  if (!isOhsFamily) {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <h2 className="text-lg font-semibold">This page is for OHS families</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
            Your account isn&apos;t recognized as an OHS family yet. Join Pixel Parents to see the
            community.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            Join Pixel Parents
          </Link>
        </div>
      </>,
    );
  }

  const [stats, breakdowns, trends] = await Promise.all([
    getStats(),
    getBreakdowns(),
    getTrends("week"),
  ]);

  if (stats.database === "pending") {
    return shell(
      <>
        <PageHeader />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-white/55">
          The community view isn&apos;t available yet — check back once families start joining.
        </div>
      </>,
    );
  }

  const markers = buildMarkers(breakdowns.signups_by_state);
  const builders = breakdowns.signups_by_builder_interest.builder ?? 0;
  const statesCount = Object.keys(breakdowns.signups_by_state).length;
  const topSkills = Object.entries(breakdowns.signups_by_skillset)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) as Array<[string, number]>;
  const interests = breakdowns.top_interests
    .slice(0, 12)
    .map((t) => [t.interest, t.count] as [string, number]);

  return shell(
    <>
      <PageHeader />
      <UnverifiedNotice status={status ?? "pending"} />
      <div className="flex flex-col gap-9">
        <section>
          <SectionLabel>Where we&apos;re building</SectionLabel>
          <WorldMap markers={markers} accent={AMBER} />
          <p className="mt-2 text-xs text-white/40">
            A pin for every state with a Pixel Parents family
            {statesCount ? ` · ${statesCount} state${statesCount === 1 ? "" : "s"} so far` : ""}. We&apos;re
            an online school, so the map keeps filling in as families join from around the world.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Families" value={stats.total_families ?? 0} />
          <StatTile label="Parents" value={stats.total_signups ?? 0} />
          <StatTile label="Kids at OHS" value={stats.total_children ?? 0} />
          <StatTile label="Here to build" value={builders} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Card title="Who's here to build">
            <BuilderBar mix={breakdowns.signups_by_builder_interest} />
          </Card>
          <Card title="Community growth">
            {trends.points.length > 1 ? (
              <Sparkline points={trends.points} />
            ) : (
              <p className="text-sm text-white/40">Not enough history yet — give it a few weeks.</p>
            )}
          </Card>
        </section>

        {topSkills.length > 0 && (
          <section>
            <SectionLabel>Skills in the community</SectionLabel>
            <Pills items={topSkills} />
          </section>
        )}

        {interests.length > 0 && (
          <section>
            <SectionLabel>What we&apos;re into</SectionLabel>
            <Pills items={interests} />
          </section>
        )}
      </div>
    </>,
  );
}
