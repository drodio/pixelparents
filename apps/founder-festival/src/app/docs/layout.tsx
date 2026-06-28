import Link from "next/link";
import { getCurrentViewerContext } from "@/lib/current-viewer";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { DocsNav } from "@/components/docs/DocsNav";

// Public docs shell: the same logo + site nav header as /leaderboard and
// /changelog, then the left docs nav + the page body. Public — no auth to read.
export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getCurrentViewerContext();

  return (
    <div className="flex flex-1 flex-col bg-[#151515] px-4 py-8 text-zinc-100 sm:px-6 sm:py-12">
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
          currentPage="docs"
          userProfileHref={viewer.profileHref}
          isAuthed={viewer.isAuthed}
        />
      </header>

      <div className="mx-auto flex w-full max-w-5xl gap-8">
        <DocsNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
