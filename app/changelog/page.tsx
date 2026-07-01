import type { Metadata } from "next";
import Link from "next/link";
import { getChangelogEntries } from "@/lib/changelog";
import { ChangelogTimeline } from "./timeline";
import { ChangelogSubscribe } from "./subscribe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog — Pixel Parents",
  description: "What we've shipped on Pixel Parents.",
};

export default async function ChangelogPage() {
  const entries = await getChangelogEntries();

  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Changelog</h1>
            <p className="mt-2 text-white/60">
              Everything we&apos;ve shipped on Pixel Parents — newest first.
            </p>
          </div>
          <ChangelogSubscribe />
        </div>

        <div className="mt-10">
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white/50">
              No entries yet — check back soon.
            </p>
          ) : (
            <ChangelogTimeline entries={entries} />
          )}
        </div>

        <footer className="mt-16 border-t border-white/10 pt-6 text-sm text-white/45">
          <Link href="/" className="text-white/65 hover:underline">
            Pixel Parents →
          </Link>
        </footer>
      </div>
    </main>
  );
}
