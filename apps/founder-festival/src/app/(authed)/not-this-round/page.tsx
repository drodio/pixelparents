import { db } from "@/db";
import { evaluations, events as eventsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { isUuid } from "@/lib/canonicalize";
import { isAdmin } from "@/lib/admin";
import { headers } from "next/headers";
import { ScoreDetailButton } from "@/components/ScoreDetailButton";
import { ReScoreButton } from "@/components/ReScoreButton";
import { AppliedBanner } from "@/components/events/AppliedBanner";

type PageProps = { searchParams: Promise<{ e?: string; applied?: string }> };

type Row = { points: number; reason: string };
type BreakdownShape = { founder?: Row[]; investor?: Row[] } | Row[] | null;
type RecommendationsData = {
  summary: string;
  items: Array<{ id: string; text: string; category: string }>;
};

function splitBreakdown(b: BreakdownShape): { founder: Row[]; investor: Row[] } {
  if (Array.isArray(b)) return { founder: b, investor: [] };
  if (b && typeof b === "object") return { founder: b.founder ?? [], investor: b.investor ?? [] };
  return { founder: [], investor: [] };
}

export default async function NotThisRoundPage({ searchParams }: PageProps) {
  const { e, applied } = await searchParams;

  // Fetch the row whenever an eval id is present — needed for the Re-Score
  // button regardless of environment. The Score Detail button stays
  // localhost-only (it would leak debug data on prod).
  let evalRow: typeof evaluations.$inferSelect | null = null;
  let isLocalhost = false;
  if (isUuid(e)) {
    const headersList = await headers();
    const host = (headersList.get("host") ?? "").toLowerCase();
    isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const [r] = await db.select().from(evaluations).where(eq(evaluations.id, e)).limit(1);
    evalRow = r ?? null;
  }
  // Admins can re-score any eval without claiming (mirrors /api/rescore's
  // gating). For non-admins this lands in the claim modal as before.
  const { userId: clerkUserId } = await auth();
  const isAdminViewer = clerkUserId ? await isAdmin() : false;
  const { founder, investor } = splitBreakdown(
    (evalRow?.breakdown ?? null) as BreakdownShape,
  );

  // Same applied-banner lookup as /welcome — silently no-banner if the
  // slug doesn't resolve to a real event.
  let appliedEventTitle: string | null = null;
  if (applied) {
    const [evt] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.slug, applied))
      .limit(1);
    appliedEventTitle = evt?.title ?? null;
  }

  return (
    <div className="flex flex-col flex-1 bg-[#151515] text-zinc-100">
      {evalRow && (
        <header className="flex justify-end items-center gap-6 px-4 sm:px-6 py-4">
          {isLocalhost && (
            <ScoreDetailButton
              evaluationId={evalRow.id}
              linkedinUrl={evalRow.linkedinUrl}
              profile={evalRow.profile as never}
              grounding={evalRow.exaGrounding}
              founderBreakdown={founder}
              investorBreakdown={investor}
              founderScore={evalRow.founderScore}
              investorScore={evalRow.investorScore}
              combinedScore={evalRow.score}
              signalQuality={evalRow.signalQuality}
              companyStage={evalRow.companyStage}
              source={evalRow.source}
              sourceCode={evalRow.sourceCode}
              createdAt={evalRow.createdAt.toISOString()}
              updatedAt={evalRow.updatedAt.toISOString()}
              recommendations={(evalRow.recommendations ?? null) as RecommendationsData | null}
              meta={{
                fullName: evalRow.fullName,
                pricing: evalRow.pricing ?? null,
                costLlmCents: evalRow.costLlmCents,
                costExaCents: evalRow.costExaCents,
                costTotalCents: evalRow.costTotalCents,
                investorStageFocus: evalRow.investorStageFocus ?? null,
                investorIndustryFocus: evalRow.investorIndustryFocus ?? null,
                investorLeadsRounds: evalRow.investorLeadsRounds,
                investorCheckSize: evalRow.investorCheckSize ?? null,
                onNeo: evalRow.onNeo,
                neoSlug: evalRow.neoSlug,
                summarySource: evalRow.summarySource,
                summaryStatus: evalRow.summaryStatus,
                summaryConfidence: evalRow.summaryConfidence,
                summaryOriginalText: evalRow.summaryOriginalText,
                subjectCity: evalRow.subjectCity,
                subjectRegion: evalRow.subjectRegion,
                subjectCountry: evalRow.subjectCountry,
                slug: evalRow.slug,
                slugKind: evalRow.slugKind,
              }}
            />
          )}
          {evalRow.source !== "code" && (
            <ReScoreButton evaluationId={evalRow.id} isAdmin={isAdminViewer} />
          )}
        </header>
      )}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-6 text-center">
        {appliedEventTitle && <AppliedBanner eventTitle={appliedEventTitle} />}
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight max-w-xl">
          We couldn&apos;t find enough public information about you.
        </h1>
        <p className="max-w-md text-zinc-400">
          Double-check the LinkedIn URL you entered, or try a different one.
        </p>
        <a href="/?home=1" className="link mt-2 text-sm">
          ← Back to the start
        </a>
      </main>
    </div>
  );
}
