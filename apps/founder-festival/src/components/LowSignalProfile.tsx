import { AppliedBanner } from "./events/AppliedBanner";
import { StatusMarker } from "./FounderStatusMarker";
import { LowSignalClaimCTA } from "./LowSignalClaimCTA";

type Props = {
  evaluationId: string;
  name: string;
  firstName: string | null;
  isOwner: boolean;
  appliedEventTitle: string | null;
};

// Profile view for a low-signal eval: we couldn't find enough public data to
// score this person, so instead of a score breakdown we show their name, a
// plain "not enough data" message, and a claim CTA so they can take over the
// profile and add their information. Replaces the old /not-this-round bounce.
export function LowSignalProfile({ evaluationId, name, firstName, isOwner, appliedEventTitle }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-[#151515] text-zinc-100">
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12 text-center">
        {appliedEventTitle && <AppliedBanner eventTitle={appliedEventTitle} />}
        <h1 className="font-display max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {name}
          <StatusMarker role="founder" status="never" />
        </h1>
        <p className="max-w-xl text-xl text-zinc-300 sm:text-2xl">
          Not enough public data to score this person.
        </p>
        {!isOwner && <LowSignalClaimCTA evaluationId={evaluationId} firstName={firstName} />}
        <a href="/?home=1" className="link mt-2 text-sm">
          ← Back to the start
        </a>
      </main>
    </div>
  );
}
