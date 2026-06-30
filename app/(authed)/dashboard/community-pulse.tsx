import { IconSparkles, IconCode, IconUsers } from "@/components/icons";

// "Community pulse" — a compact data-viz strip built from getBreakdowns().
// Two panels: top shared interests as horizontal bars, and a builder-vs-learner
// split bar. Purely presentational (server component); the bars animate their
// width in via a CSS keyframe defined inline that respects reduced-motion.
//
// All inputs are already k-anon aggregated upstream (getBreakdowns), so nothing
// here is PII — just counts.

type TopInterest = { interest: string; count: number };

function Bar({
  label,
  count,
  max,
  delayMs,
}: {
  label: string;
  count: number;
  max: number;
  delayMs: number;
}) {
  const pct = max > 0 ? Math.max(6, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 truncate text-sm text-white/70" title={label}>
        {label}
      </div>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="pp-bar-grow absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500/70 to-amber-400"
          style={{ width: `${pct}%`, animationDelay: `${delayMs}ms` }}
        />
      </div>
      <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-white/80">
        {count.toLocaleString()}
      </div>
    </div>
  );
}

export function CommunityPulse({
  topInterests,
  builders,
}: {
  topInterests: TopInterest[];
  builders: { builder: number; aspiring: number };
}) {
  const interests = topInterests.slice(0, 5).filter((i) => i.count > 0);
  const maxInterest = interests.reduce((m, i) => Math.max(m, i.count), 0);

  const totalBuilders = builders.builder + builders.aspiring;
  const builderPct =
    totalBuilders > 0 ? Math.round((builders.builder / totalBuilders) * 100) : 0;
  const learnerPct = totalBuilders > 0 ? 100 - builderPct : 0;

  const hasInterests = interests.length > 0;
  const hasSplit = totalBuilders > 0;
  if (!hasInterests && !hasSplit) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/40">
        <IconSparkles className="h-3.5 w-3.5 text-amber-300" />
        Community pulse
      </h2>
      {/* Inline keyframe — width grows from 0 to its target on mount. Reduced
          motion users see the bars at full width with no transition. */}
      <style>{`
        @keyframes pp-bar-grow {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .pp-bar-grow {
          transform-origin: left center;
          animation: pp-bar-grow 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .pp-bar-grow { animation: none !important; transform: scaleX(1); }
        }
      `}</style>
      <div className="grid gap-4 lg:grid-cols-2">
        {hasInterests && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 text-sm font-semibold text-white">Top shared interests</div>
            <div className="flex flex-col gap-3">
              {interests.map((i, idx) => (
                <Bar
                  key={i.interest}
                  label={i.interest}
                  count={i.count}
                  max={maxInterest}
                  delayMs={idx * 80}
                />
              ))}
            </div>
          </div>
        )}

        {hasSplit && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 text-sm font-semibold text-white">Builders vs. learners</div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="pp-bar-grow h-full bg-amber-400"
                style={{ width: `${builderPct}%` }}
                aria-hidden
              />
              <div
                className="pp-bar-grow h-full bg-sky-400/70"
                style={{ width: `${learnerPct}%`, animationDelay: "120ms" }}
                aria-hidden
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-300">
                  <IconCode className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {builders.builder.toLocaleString()}
                  </div>
                  <div className="text-xs text-white/55">Here to build</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sky-400/15 text-sky-300">
                  <IconUsers className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">
                    {builders.aspiring.toLocaleString()}
                  </div>
                  <div className="text-xs text-white/55">Learning to build</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
