"use client";

import { CredibilityRadar } from "@/components/CredibilityRadar";
import type { RadarVector } from "@/lib/credibility";
import type { CohortStats } from "@/lib/event-analytics";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <span className="font-display text-2xl font-bold text-zinc-100">{value}</span>
      <span className="text-xs uppercase tracking-wide text-zinc-500 text-center">{label}</span>
    </div>
  );
}

export function EventAnalyticsSection({
  totalAttendees,
  stats,
  founderRadar,
  investorRadar,
}: {
  totalAttendees: number;
  stats: CohortStats;
  founderRadar: RadarVector[];
  investorRadar: RadarVector[];
}) {
  const showFounder = stats.founderCount > 0;
  const showInvestor = stats.investorCount > 0;
  // Exactly one dimension present (a founders-only or investors-only cohort).
  const single = showFounder !== showInvestor;

  return (
    <section className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Attendees" value={String(totalAttendees)} />
        <Stat label="Founders" value={String(stats.founderCount)} />
        <Stat label="Investors" value={String(stats.investorCount)} />
      </div>

      {single ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-zinc-300">
            {showFounder ? "Avg founder composition" : "Avg investor composition"}
          </h3>
          <CredibilityRadar
            vectors={showFounder ? founderRadar : investorRadar}
            peerLabel={showFounder ? "founder" : "investor"}
            chartOnly
          />
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          {showFounder && (
            <div className="flex flex-col gap-2">
              <h3 className="text-center text-sm font-medium text-zinc-300">
                Avg founder composition
              </h3>
              <CredibilityRadar vectors={founderRadar} peerLabel="founder" stacked chartOnly />
            </div>
          )}
          {showInvestor && (
            <div className="flex flex-col gap-2">
              <h3 className="text-center text-sm font-medium text-zinc-300">
                Avg investor composition
              </h3>
              <CredibilityRadar vectors={investorRadar} peerLabel="investor" stacked chartOnly />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
