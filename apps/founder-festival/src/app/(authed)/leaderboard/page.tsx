import { getLeaderboard, getLeaderboardCounts, getBadgeCounts, getIndustryCounts, parseLeaderboardFilter, buildLeaderboardWhere } from "@/lib/leaderboard";
import { encodeCursor } from "@/lib/leaderboard-cursor";
import { LeaderboardClient } from "@/components/LeaderboardClient";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import { getCurrentViewerContext } from "@/lib/current-viewer";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// First-page render size for the leaderboard SSR. Subsequent pages are
// fetched client-side via /api/leaderboard/page as the user scrolls. Keep this
// small enough that the first paint is fast (and Vercel's response stays
// snappy) but large enough that most viewers don't need a second fetch
// before they start scrolling.
const INITIAL_PAGE_SIZE = 100;

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Normalize to URLSearchParams for the shared parser (first value wins for
  // any repeated key — facets are single comma-separated params).
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") usp.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") usp.set(k, v[0]);
  }
  // Server-render the first page; the client paginates with cursors after.
  const filter = { ...parseLeaderboardFilter(usp), limit: INITIAL_PAGE_SIZE, cursor: null };
  const e = typeof sp.e === "string" ? sp.e : undefined;

  const [rows, viewer, counts, badgeCounts, industryCounts] = await Promise.all([
    getLeaderboard(filter),
    getCurrentViewerContext(),
    getLeaderboardCounts(filter),
    getBadgeCounts(),
    getIndustryCounts(),
  ]);
  // Facet filters (stage/outcome/raised/team/badge) narrow the counts; when any
  // are active the subtitle says "… match your filters". Role-only changes don't
  // affect the founder/investor split, so they don't flip this.
  const filtersActive = buildLeaderboardWhere(filter) !== undefined;

  // A full page implies there are more — emit the keyset cursor so the
  // client's IntersectionObserver can request the next page.
  let nextCursor: string | null = null;
  if (rows.length === INITIAL_PAGE_SIZE && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    const score =
      filter.sort === "founder" ? last.founderScore
      : filter.sort === "investor" ? last.investorScore
      : last.combinedScore;
    nextCursor = encodeCursor({ score, id: last.id });
  }
  // Remount key: every result-affecting filter field. Sort/facet changes
  // navigate client-side (router.push), which re-renders this server component
  // with fresh `rows` but PRESERVES LeaderboardClient's React state — so its
  // `pagedRows` (seeded once from initialRows) would keep showing the old
  // ordering until a hard refresh. Keying on the filter remounts the client on
  // any such change, re-seeding it from the new server data. Excludes
  // limit/cursor (constant for SSR) and the row-highlight `e`.
  const clientKey = JSON.stringify([
    filter.role, filter.sort, filter.direction,
    filter.stages, filter.outcomes, filter.badges, filter.industries,
    filter.raisedMin, filter.raisedMax, filter.teamMin,
  ]);

  return (
    <div className="flex flex-col flex-1 px-4 sm:px-6 pt-3 pb-8 sm:pt-4 sm:pb-12 bg-[#151515] text-zinc-100">
      {/* Full-width, left-aligned to match /profile — logo/nav hug the left
          edge while the leaderboard content below stays centered (max-w-4xl). */}
      <header className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-8 w-full">
        <a href="/?home=1" aria-label="Founder Festival home" className="opacity-90 hover:opacity-100 transition-opacity shrink-0">
          <img
            src="/images/founder-festival-logo.png"
            alt="Founder Festival"
            width={498}
            height={444}
            className="w-12 sm:w-14 h-auto"
          />
        </a>
        <SiteHeaderNav
          currentPage="leaderboard"
          userProfileHref={viewer.profileHref}
          isAuthed={viewer.isAuthed}
        />
      </header>
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-center mb-2 max-w-4xl mx-auto w-full">
        Festival Leaderboard
      </h1>
      <p className="text-xl sm:text-2xl text-zinc-300 text-center mb-1 max-w-4xl mx-auto w-full">
        <strong className="font-bold text-zinc-100">
          {counts.founders.toLocaleString("en-US")}
        </strong>{" "}
        Founder and{" "}
        <strong className="font-bold text-zinc-100">
          {counts.investors.toLocaleString("en-US")}
        </strong>{" "}
        Investor Profiles{filtersActive ? " match your filters" : ""}
      </p>
      <p className="text-sm italic text-zinc-500 text-center mb-8 sm:mb-10">
        Unclaimed profiles may have incorrect information.
      </p>

      <LeaderboardClient
        key={clientKey}
        initialRows={rows}
        initialNextCursor={nextCursor}
        filter={filter}
        badgeCounts={badgeCounts}
        industryCounts={industryCounts}
        highlightEvalId={e ?? null}
        youEvalId={viewer.ownEvaluationId}
      />
    </div>
  );
}
