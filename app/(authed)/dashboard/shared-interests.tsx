import Link from "next/link";
import { IconSparkles, IconArrowRight } from "@/components/icons";
import type { SharedInterestMatch } from "@/lib/db/interest-matches";

// "Families who share your interests" — the auto-matching / suggested-connections
// section on the dashboard. Pure presentation: it renders the pre-ranked, already
// privacy-gated matches produced by getSharedInterestMatches (see
// lib/db/interest-matches.ts). Every field here comes from a directory card
// projection, so it shows only the same coarsened, opt-in info the directory shows
// (coarsened names — students are first-name-only upstream — and a /directory/<token>
// link only when the family shares a profile). No email/phone/child PII.

function MatchCard({ match }: { match: SharedInterestMatch }) {
  const name = match.name || "An OHS family";
  const shown = match.sharedInterests.slice(0, 4);
  const overflow = match.sharedInterests.length - shown.length;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-white">{name}</span>
        <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
          {match.score} shared
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.map((interest) => (
          <span
            key={interest}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/70"
          >
            {interest}
          </span>
        ))}
        {overflow > 0 && (
          <span className="rounded-full px-2 py-0.5 text-xs text-white/40">+{overflow} more</span>
        )}
      </div>
    </>
  );

  // Link to the shared profile ONLY when the family exposes one (token set by the
  // directory-visibility gate). Otherwise render a non-link card — the family
  // matched on interests but shares no clickable profile.
  if (match.token) {
    return (
      <Link
        href={`/directory/${match.token}`}
        className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
      >
        {inner}
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-300/80">
          View profile
          <IconArrowRight className="h-3.5 w-3.5 -translate-x-0.5 transition-transform group-hover:translate-x-0" />
        </span>
      </Link>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">{inner}</div>
  );
}

export function SharedInterests({ matches }: { matches: SharedInterestMatch[] }) {
  // Nothing to show (viewer shares no interests, or no one else overlaps) → render
  // nothing. The dashboard simply omits the section.
  if (matches.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
        <IconSparkles className="h-3.5 w-3.5 text-amber-300/70" />
        Families who share your interests
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <MatchCard key={m.signupId} match={m} />
        ))}
      </div>
      <p className="mt-3 text-xs text-white/40">
        Ranked by how many interests you have in common. Browse everyone in the{" "}
        <Link href="/directory" className="text-amber-300/80 hover:text-amber-300">
          directory
        </Link>
        .
      </p>
    </section>
  );
}
