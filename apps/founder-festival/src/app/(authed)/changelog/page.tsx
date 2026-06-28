import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getChangelogEntries, isChangelogSubscriber, computeChangelogStats } from "@/lib/changelog";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { ChangelogTimeline } from "@/components/changelog/ChangelogTimeline";
import { ChangelogSubscribe } from "@/components/changelog/ChangelogSubscribe";

export const metadata: Metadata = {
  title: "Changelog — Founder Festival",
  description: "Everything we ship — and why.",
};

export const dynamic = "force-dynamic";

export default async function ChangelogPage() {
  const [entries, viewer, authRes] = await Promise.all([
    getChangelogEntries(),
    getCurrentViewerContext(),
    auth(),
  ]);
  const subscribed = authRes.userId ? await isChangelogSubscriber(authRes.userId) : false;

  const stats = computeChangelogStats(entries);

  return (
    <div className="flex flex-1 flex-col bg-[#151515] px-4 pt-3 pb-8 text-zinc-100 sm:px-6 sm:pt-4 sm:pb-12">
      {/* Same logo + nav header as /leaderboard and /profile. */}
      <header className="mb-6 flex w-full items-center gap-4 sm:mb-8 sm:gap-6">
        <Link
          href="/?home=1"
          aria-label="Founder Festival home"
          className="shrink-0 opacity-90 transition-opacity hover:opacity-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="h-auto w-12 sm:w-14"
          />
        </Link>
        <SiteHeaderNav
          currentPage="changelog"
          userProfileHref={viewer.profileHref}
          isAuthed={viewer.isAuthed}
        />
      </header>

      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Changelog
            </h1>
          </div>
          <ChangelogSubscribe subscribed={subscribed} />
        </div>

        <ChangelogTimeline entries={entries} stats={stats} />
      </div>
    </div>
  );
}
