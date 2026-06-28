"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { MatrixMatch, MatrixResult } from "@/lib/founder-matrix";

// "Relationship Matrix": per-vector lists of people most like / most
// complementary / least like you. When the profile scored on BOTH dimensions a
// Founder/Investor toggle lets the viewer compare relationships on either one
// (mirrors the Credibility radar's toggle). Rendered just below the Credibility
// section.
//
// Clicking a pill navigates to that profile with #founder-matrix in the hash so
// the destination page scrolls to its own matrix. (The id is kept as
// "founder-matrix" so existing cross-profile anchor links still resolve.)

type Dim = "founder" | "investor";

type Props = {
  founder: MatrixResult | null;
  investor: MatrixResult | null;
  // Which dimension to show first — the dominant (higher) score, matching the
  // headline-score and Credibility-radar conventions.
  defaultDimension: Dim;
};

function isEmpty(m: MatrixResult | null): m is null {
  return (
    !m ||
    (m.similar.length === 0 &&
      m.complement.length === 0 &&
      m.opposite.length === 0)
  );
}

export function FounderMatrix({ founder, investor, defaultDimension }: Props) {
  const hasFounder = !isEmpty(founder);
  const hasInvestor = !isEmpty(investor);
  const both = hasFounder && hasInvestor;
  const [dim, setDim] = useState<Dim>(defaultDimension);

  if (!hasFounder && !hasInvestor) return null;

  const active = both
    ? dim === "investor"
      ? investor
      : founder
    : hasFounder
      ? founder
      : investor;
  if (!active) return null;

  return (
    <section id="founder-matrix" className="w-full flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl font-bold text-zinc-100">
          Relationship Matrix
        </h3>
      </div>

      {both && (
        <div className="inline-flex self-start rounded-md border border-zinc-800 p-0.5 text-sm">
          {(["founder", "investor"] as Dim[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDim(d)}
              className={`rounded-md px-3 py-1 capitalize cursor-pointer transition-colors ${
                dim === d
                  ? "bg-[#dfa43a]/15 text-[#dfa43a]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-[#1b1b1b] p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <MatrixColumn title="Most Like You" matches={active.similar} />
          <MatrixColumn title="Most Complimentary" matches={active.complement} />
          <MatrixColumn title="Least Like You" matches={active.opposite} />
        </div>
      </div>
    </section>
  );
}

function MatrixColumn({ title, matches }: { title: string; matches: MatrixMatch[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <h4 className="text-xs uppercase tracking-[0.18em] font-medium text-zinc-500">
        {title}
      </h4>
      {matches.length === 0 ? (
        <p className="text-sm text-zinc-600 italic">No matches yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {matches.map((m) => (
            <li key={m.evalId}>
              <Link
                href={`${m.profileHref}#founder-matrix`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/60 transition-colors min-w-0"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar imageUrl={m.imageUrl} name={m.fullName} size="xs" />
                  <span className="truncate text-sm text-zinc-200">
                    {m.fullName ?? "Unnamed founder"}
                  </span>
                </span>
                <span
                  className="tabular-nums text-sm font-semibold shrink-0"
                  style={{ color: "#dfa43a" }}
                >
                  {m.displayScore}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
